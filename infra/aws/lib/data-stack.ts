import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as efs from 'aws-cdk-lib/aws-efs'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as secrets from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import { API_PORT, type EwsConfig, stackName } from './config'

/**
 * Everything that holds state or rarely changes: network, database, object store, secrets, image repository, cluster, log group.
 * Termination protection is on and every stateful resource is retained or snapshotted on removal.
 * The stack never needs the image tag, so a normal deployment of the application does not touch it.
 */
export class DataStack extends cdk.Stack {
  readonly vpc: ec2.Vpc
  readonly repository: ecr.Repository
  readonly cluster: ecs.Cluster
  readonly logGroup: logs.LogGroup
  readonly database: rds.DatabaseInstance
  readonly dbSecret: secrets.ISecret
  readonly assistantKey: secrets.Secret
  readonly fileSystem: efs.FileSystem
  readonly accessPoint: efs.AccessPoint
  readonly albSg: ec2.SecurityGroup
  readonly taskSg: ec2.SecurityGroup

  constructor(scope: Construct, id: string, cfg: EwsConfig, props: cdk.StackProps = {}) {
    super(scope, id, { ...props, env: cfg.env, stackName: stackName(cfg, 'Data'), terminationProtection: true, description: 'EWS dev: network, PostgreSQL 17, EFS, secrets, ECR, ECS cluster (stateful, retained).' })

    // Network: no NAT gateway. Fargate runs in public subnets with a public IP for outbound traffic only (nothing can connect in:
    // the task security group admits the load balancer alone). RDS, EFS and the internal load balancer use isolated subnets.
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.20.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } },
    })

    // Security groups (all rules live in this stack so the other stacks cannot create a dependency cycle).
    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', { vpc: this.vpc, description: 'Internal ALB: HTTP from the CloudFront VPC-origin security group only (rule added by the Edge stack)', allowAllOutbound: false })
    this.taskSg = new ec2.SecurityGroup(this, 'TaskSg', { vpc: this.vpc, description: 'API and migration tasks: inbound from the ALB only; outbound for ECR, Secrets Manager, logs, AI providers' })
    const dbSg = new ec2.SecurityGroup(this, 'DbSg', { vpc: this.vpc, description: 'RDS: PostgreSQL from the tasks only', allowAllOutbound: false })
    const efsSg = new ec2.SecurityGroup(this, 'EfsSg', { vpc: this.vpc, description: 'EFS: NFS from the tasks only', allowAllOutbound: false })
    this.albSg.addEgressRule(this.taskSg, ec2.Port.tcp(API_PORT), 'to the tasks')
    this.taskSg.addIngressRule(this.albSg, ec2.Port.tcp(API_PORT), 'from the ALB')
    dbSg.addIngressRule(this.taskSg, ec2.Port.tcp(5432), 'PostgreSQL from the tasks')
    efsSg.addIngressRule(this.taskSg, ec2.Port.tcp(2049), 'NFS from the tasks')

    // Image repository: immutable tags (a commit SHA), scan on push, keep the last 20 images.
    this.repository = new ecr.Repository(this, 'Api', {
      repositoryName: 'ews/api',
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ description: 'keep the last 20 images', maxImageCount: 20 }],
    })

    // Database: PostgreSQL 17, single AZ, smallest sensible class, encrypted, 7 days of backups, protected.
    // The master password is generated into Secrets Manager and never appears in the template.
    const parameterGroup = new rds.ParameterGroup(this, 'Pg17', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
      description: 'EWS PostgreSQL 17 parameters',
      parameters: { 'rds.force_ssl': '1', log_min_duration_statement: '1000', idle_in_transaction_session_timeout: '60000' },
    })
    const masterSecret = new rds.DatabaseSecret(this, 'DbSecret', { username: 'ews_admin', secretName: 'ews/dev/db', excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\=,.^-' })
    masterSecret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    this.database = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      publiclyAccessible: false,
      multiAz: false,
      databaseName: 'ews', // never ews_dev / ews_test*: the repository's reset guard can never match this name
      credentials: rds.Credentials.fromSecret(masterSecret),
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deleteAutomatedBackups: false,
      autoMinorVersionUpgrade: true,
      parameterGroup,
    })
    this.dbSecret = this.database.secret! // the same secret with host, port and dbname added once the instance exists

    // EWS_ASSISTANT_KEY: 64 hex characters (32 bytes), generated by Secrets Manager, kept when the stack is deleted.
    this.assistantKey = new secrets.Secret(this, 'AssistantKey', {
      secretName: 'ews/dev/assistant-key',
      description: 'EWS_ASSISTANT_KEY: encrypts stored AI connections. Losing or rotating it makes stored connections unreadable.',
      generateSecretString: { passwordLength: 64, excludePunctuation: true, excludeUppercase: true, excludeCharacters: 'ghijklmnopqrstuvwxyz', includeSpace: false },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // Object store (STORAGE_DIR): EFS, encrypted, retained, daily backup. One access point owned by the container user (uid 1000).
    this.fileSystem = new efs.FileSystem(this, 'Objects', {
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroup: efsSg,
      encrypted: true,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.ELASTIC,
      enableAutomaticBackups: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      allowAnonymousAccess: false,
    })
    this.accessPoint = this.fileSystem.addAccessPoint('ObjectsAp', {
      path: '/objects',
      posixUser: { uid: '1000', gid: '1000' },
      createAcl: { ownerUid: '1000', ownerGid: '1000', permissions: '0750' },
    })

    // Cluster (empty clusters cost nothing) and log group (30 days).
    this.cluster = new ecs.Cluster(this, 'Cluster', { vpc: this.vpc, clusterName: 'ews-dev' })
    this.logGroup = new logs.LogGroup(this, 'ApiLogs', { logGroupName: '/ews/dev/api', retention: logs.RetentionDays.ONE_MONTH, removalPolicy: cdk.RemovalPolicy.DESTROY })

    cdk.Tags.of(this).add('project', 'ews')
    cdk.Tags.of(this).add('env', cfg.envName)
  }
}
