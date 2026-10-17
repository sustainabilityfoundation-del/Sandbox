import * as cdk from 'aws-cdk-lib'
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import type { DataStack } from './data-stack'
import { API_PORT, type EwsConfig, stackName } from './config'
import { ARM64, apiImage, baseEnvironment, databaseSecrets } from './task'

/** The API: one ARM64 Fargate task behind an internal ALB (reached by CloudFront through a VPC origin). */
export class AppStack extends cdk.Stack {
  readonly loadBalancer: elbv2.ApplicationLoadBalancer
  readonly service: ecs.FargateService

  constructor(scope: Construct, id: string, cfg: EwsConfig, data: DataStack, props: cdk.StackProps = {}) {
    super(scope, id, { ...props, env: cfg.env, stackName: stackName(cfg, 'App'), description: 'EWS dev: API service (ECS Fargate, 1 ARM64 task) and internal load balancer.' })

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTask', { family: 'ews-dev-api', cpu: 512, memoryLimitMiB: 1024, runtimePlatform: ARM64 })

    // Dev identities are accepted only because the whole site sits behind the CloudFront password gate (EWS_ALLOW_DEV_IDENTITIES=1,
    // prototype). Remove this variable when Cognito sign-in replaces the gate. No AI provider keys are set, ever.
    const environment: Record<string, string> = {
      ...baseEnvironment(cfg),
      EWS_ALLOW_DEV_IDENTITIES: '1',
      API_HOST: '0.0.0.0',
      API_PORT: String(API_PORT),
      STORAGE_DIR: '/data/objects',
      SEED_ON_START: 'false',
    }
    if (cfg.publicOrigin) environment.EWS_PUBLIC_ORIGIN = cfg.publicOrigin

    taskDefinition.addVolume({
      name: 'objects',
      efsVolumeConfiguration: {
        fileSystemId: data.fileSystem.fileSystemId,
        transitEncryption: 'ENABLED',
        authorizationConfig: { accessPointId: data.accessPoint.accessPointId, iam: 'ENABLED' },
      },
    })
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
        resources: [data.fileSystem.fileSystemArn],
        conditions: { StringEquals: { 'elasticfilesystem:AccessPointArn': data.accessPoint.accessPointArn } },
      }),
    )

    const container = taskDefinition.addContainer('api', {
      image: apiImage(data, cfg),
      essential: true,
      environment,
      secrets: { ...databaseSecrets(data), EWS_ASSISTANT_KEY: ecs.Secret.fromSecretsManager(data.assistantKey) },
      portMappings: [{ containerPort: API_PORT }],
      stopTimeout: cdk.Duration.seconds(30),
      logging: ecs.LogDrivers.awsLogs({ logGroup: data.logGroup, streamPrefix: 'api' }),
      // Liveness only (/health never touches the database); readiness (/ready) is the load balancer's check.
      healthCheck: {
        command: ['CMD-SHELL', `node -e "fetch('http://127.0.0.1:${API_PORT}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    })
    container.addMountPoints({ containerPath: '/data/objects', sourceVolume: 'objects', readOnly: false })

    // Internal ALB in the isolated subnets. Its security group admits HTTP from inside the VPC only; there is no route from the internet.
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: data.vpc,
      internetFacing: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroup: data.albSg,
      idleTimeout: cdk.Duration.seconds(120),
    })
    const listener = this.loadBalancer.addListener('Http', { port: 80, protocol: elbv2.ApplicationProtocol.HTTP, open: false })

    this.service = new ecs.FargateService(this, 'Api', {
      cluster: data.cluster,
      serviceName: 'api',
      taskDefinition,
      desiredCount: cfg.nightSchedule ? undefined : 1,
      assignPublicIp: true, // outbound only (ECR, Secrets Manager, logs, AI providers); no NAT gateway
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [data.taskSg],
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      circuitBreaker: { enable: true, rollback: true },
      enableExecuteCommand: false,
    })

    listener.addTargets('Api', {
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: { path: '/ready', interval: cdk.Duration.seconds(30), timeout: cdk.Duration.seconds(5), healthyThresholdCount: 2, unhealthyThresholdCount: 3 },
    })

    if (cfg.nightSchedule) {
      const scaling = this.service.autoScaleTaskCount({ minCapacity: 0, maxCapacity: 1 })
      const tz = cfg.nightSchedule.timeZone ? cdk.TimeZone.of(cfg.nightSchedule.timeZone) : undefined
      scaling.scaleOnSchedule('NightStop', { schedule: appscaling.Schedule.cron(cfg.nightSchedule.stop), minCapacity: 0, maxCapacity: 0, timeZone: tz })
      scaling.scaleOnSchedule('MorningStart', { schedule: appscaling.Schedule.cron(cfg.nightSchedule.start), minCapacity: 1, maxCapacity: 1, timeZone: tz })
    }

    new cdk.CfnOutput(this, 'ServiceName', { value: this.service.serviceName })

    cdk.Tags.of(this).add('project', 'ews')
    cdk.Tags.of(this).add('env', cfg.envName)
  }
}
