import { readFileSync, readdirSync, statSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../lib/build'
import { readConfig } from '../lib/config'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function build(context: Record<string, string> = {}) {
  const app = new cdk.App({ context: { imageTag: 'abc1234', ...context } })
  const cfg = readConfig(app, {})
  const stacks = buildApp(app, cfg)
  return { app, cfg, stacks, tpl: Object.fromEntries(Object.entries(stacks).map(([k, s]) => [k, Template.fromStack(s)])) as Record<keyof typeof stacks, Template> }
}

describe('dev stack (environment-agnostic synth)', () => {
  let b: ReturnType<typeof build>
  beforeAll(() => {
    b = build()
  })

  describe('network and data', () => {
    it('has no NAT gateway and no interface endpoint', () => {
      b.tpl.data.resourceCountIs('AWS::EC2::NatGateway', 0)
      b.tpl.data.resourceCountIs('AWS::EC2::EIP', 0)
      const endpoints = b.tpl.data.findResources('AWS::EC2::VPCEndpoint')
      for (const e of Object.values(endpoints)) expect((e as { Properties: { VpcEndpointType?: string } }).Properties.VpcEndpointType).toBe('Gateway')
    })

    it('puts RDS in isolated subnets, not public, encrypted, protected, backed up, single AZ, PostgreSQL 17', () => {
      b.tpl.data.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
        EngineVersion: Match.stringLikeRegexp('^17'),
        DBInstanceClass: 'db.t4g.micro',
        PubliclyAccessible: false,
        StorageEncrypted: true,
        DeletionProtection: true,
        MultiAZ: false,
        BackupRetentionPeriod: 7,
        StorageType: 'gp3',
        DBName: 'ews',
      })
      b.tpl.data.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Snapshot', UpdateReplacePolicy: 'Snapshot' })
    })

    it('uses an ordinary non-development database name and a TLS-only parameter group', () => {
      b.tpl.data.hasResourceProperties('AWS::RDS::DBParameterGroup', { Parameters: Match.objectLike({ 'rds.force_ssl': '1' }) })
    })

    it('opens PostgreSQL and NFS to the task security group only, and nothing to the internet', () => {
      const rules = b.tpl.data.findResources('AWS::EC2::SecurityGroupIngress')
      for (const r of Object.values(rules)) {
        const p = (r as { Properties: Record<string, unknown> }).Properties
        expect(p.CidrIp).toBeUndefined()
        expect(p.CidrIpv6).toBeUndefined()
      }
      const groups = JSON.stringify(b.tpl.data.findResources('AWS::EC2::SecurityGroup'))
      expect(groups).not.toContain('0.0.0.0/0/')
      // No CIDR rule anywhere in the data stack (not even the VPC range); the ALB admits only the CloudFront VPC-origin group.
      expect(groups).not.toContain('SecurityGroupIngress') // no inline ingress at all; the rules above are all group-to-group
    })

    it('admits the ALB only from the CloudFront VPC-origin security group', () => {
      b.tpl.edge.hasResourceProperties('AWS::EC2::SecurityGroupIngress', { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, SourceSecurityGroupId: Match.anyValue(), GroupId: Match.anyValue() })
      const rule = Object.values(b.tpl.edge.findResources('AWS::EC2::SecurityGroupIngress'))[0] as { Properties: Record<string, unknown> }
      expect(rule.Properties.CidrIp).toBeUndefined()
      expect(JSON.stringify(b.tpl.edge.findResources('Custom::AWS'))).toContain('CloudFront-VPCOrigins-Service-SG')
    })

    it('encrypts EFS and retains it', () => {
      b.tpl.data.hasResourceProperties('AWS::EFS::FileSystem', { Encrypted: true, BackupPolicy: { Status: 'ENABLED' } })
      b.tpl.data.hasResource('AWS::EFS::FileSystem', { DeletionPolicy: 'Retain' })
    })

    it('retains secrets and generates the assistant key as 64 hex characters', () => {
      b.tpl.data.hasResource('AWS::SecretsManager::Secret', { Properties: { Name: 'ews/dev/assistant-key', GenerateSecretString: Match.objectLike({ PasswordLength: 64, ExcludeUppercase: true, ExcludePunctuation: true }) }, DeletionPolicy: 'Retain' })
      b.tpl.data.hasResource('AWS::SecretsManager::Secret', { Properties: { Name: 'ews/dev/db' }, DeletionPolicy: 'Retain' })
    })

    it('has an immutable, scanned ECR repository and a 30-day log group', () => {
      b.tpl.data.hasResourceProperties('AWS::ECR::Repository', { ImageTagMutability: 'IMMUTABLE', ImageScanningConfiguration: { ScanOnPush: true }, RepositoryName: 'ews/api' })
      b.tpl.data.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/ews/dev/api', RetentionInDays: 30 })
    })

    it('has termination protection', () => {
      expect(b.stacks.data.terminationProtection).toBe(true)
    })
  })

  describe('application', () => {
    it('runs one ARM64 Fargate task with the deployed switches and no AI keys', () => {
      b.tpl.application.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 1, LaunchType: 'FARGATE', DeploymentConfiguration: Match.objectLike({ DeploymentCircuitBreaker: { Enable: true, Rollback: true } }) })
      b.tpl.application.hasResourceProperties('AWS::ECS::TaskDefinition', {
        RuntimePlatform: { CpuArchitecture: 'ARM64', OperatingSystemFamily: 'LINUX' },
        ContainerDefinitions: [Match.objectLike({
          Environment: Match.arrayWith([{ Name: 'EWS_DEPLOYED', Value: '1' }, { Name: 'EWS_PG', Value: 'external' }, { Name: 'SEED_ON_START', Value: 'false' }]),
          Secrets: Match.arrayWith([Match.objectLike({ Name: 'DB_PASSWORD' }), Match.objectLike({ Name: 'EWS_ASSISTANT_KEY' })]),
        })],
      })
      const text = JSON.stringify(b.tpl.application.toJSON())
      for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'XAI_API_KEY', 'EWS_AI_MODE', 'DATABASE_URL', 'NODE_ENV']) expect(text).not.toContain(`"${name}"`)
    })

    it('checks /health in the container and /ready at the load balancer', () => {
      expect(JSON.stringify(b.tpl.application.toJSON())).toContain('/health')
      b.tpl.application.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', { HealthCheckPath: '/ready', Port: 8080 })
    })

    it('uses an internal load balancer and public IPs for the task only', () => {
      b.tpl.application.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', { Scheme: 'internal' })
      b.tpl.application.hasResourceProperties('AWS::ECS::Service', { NetworkConfiguration: { AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: 'ENABLED' }) } })
    })

    it('limits file-system access to one access point', () => {
      b.tpl.application.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'], Condition: { StringEquals: { 'elasticfilesystem:AccessPointArn': Match.anyValue() } } })]) },
      })
    })

    it('defines the migration task with npm run db:migrate and no file system or assistant key', () => {
      b.tpl.migrate.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Family: 'ews-dev-migrate',
        RuntimePlatform: { CpuArchitecture: 'ARM64', OperatingSystemFamily: 'LINUX' },
        ContainerDefinitions: [Match.objectLike({ Command: ['npm', 'run', 'db:migrate'], Environment: Match.arrayWith([{ Name: 'EWS_DEPLOYED', Value: '1' }, { Name: 'EWS_PG', Value: 'external' }]) })],
      })
      const text = JSON.stringify(b.tpl.migrate.toJSON())
      expect(text).not.toContain('EWS_ASSISTANT_KEY')
      expect(text).not.toContain('Volumes')
    })

    it('adds no night schedule unless asked', () => {
      b.tpl.application.resourceCountIs('AWS::ApplicationAutoScaling::ScalableTarget', 0)
    })
  })

  describe('edge', () => {
    it('keeps the bucket private and serves it through origin access control', () => {
      b.tpl.edge.hasResourceProperties('AWS::S3::Bucket', { PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true } })
      b.tpl.edge.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1)
      b.tpl.edge.resourceCountIs('AWS::CloudFront::VpcOrigin', 1)
    })

    it('puts the password gate in front of both behaviours, with an empty Key Value Store', () => {
      b.tpl.edge.hasResourceProperties('AWS::CloudFront::Function', { FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0', KeyValueStoreAssociations: Match.anyValue() }) })
      const dist = Object.values(b.tpl.edge.findResources('AWS::CloudFront::Distribution'))[0] as { Properties: { DistributionConfig: { DefaultCacheBehavior: { FunctionAssociations: unknown[]; ViewerProtocolPolicy: string }; CacheBehaviors: { PathPattern: string; FunctionAssociations: unknown[]; ViewerProtocolPolicy: string }[] } } }
      const cfg = dist.Properties.DistributionConfig
      expect(cfg.DefaultCacheBehavior.FunctionAssociations).toHaveLength(1)
      expect(cfg.DefaultCacheBehavior.ViewerProtocolPolicy).toBe('redirect-to-https')
      expect(cfg.CacheBehaviors.map((c) => c.PathPattern)).toEqual(['/api/*'])
      expect(cfg.CacheBehaviors[0]!.FunctionAssociations).toHaveLength(1)
      const stores = b.tpl.edge.findResources('AWS::CloudFront::KeyValueStore')
      for (const s of Object.values(stores)) expect((s as { Properties: Record<string, unknown> }).Properties.ImportSource).toBeUndefined()
    })

    it('does not forward the Authorization header to the API', () => {
      b.tpl.edge.hasResourceProperties('AWS::CloudFront::OriginRequestPolicy', { OriginRequestPolicyConfig: Match.objectLike({ HeadersConfig: { HeaderBehavior: 'whitelist', Headers: Match.not(Match.arrayWith(['Authorization'])) }, CookiesConfig: { CookieBehavior: 'none' } }) })
    })

    it('embeds no credential or hash in the function code', () => {
      const fn = Object.values(b.tpl.edge.findResources('AWS::CloudFront::Function'))[0] as { Properties: { FunctionCode: string } }
      expect(fn.Properties.FunctionCode).not.toMatch(/[0-9a-f]{32,}/i)
      expect(fn.Properties.FunctionCode).not.toMatch(/Basic [A-Za-z0-9+/=]{8,}/)
    })
  })

  describe('GitHub OIDC role', () => {
    it('trusts one repository and one branch for the STS audience', () => {
      b.tpl.oidc.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: { Statement: [Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: { StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com', 'token.actions.githubusercontent.com:sub': 'repo:sustainabilityfoundation-del/Sandbox:ref:refs/heads/main' } },
        })] },
      })
      b.tpl.oidc.hasResourceProperties('AWS::IAM::OIDCProvider', { Url: 'https://token.actions.githubusercontent.com', ClientIdList: ['sts.amazonaws.com'] })
    })

    it('has no wildcard action and no IAM-writing or CloudFormation-writing permission', () => {
      const text = JSON.stringify(b.tpl.oidc.findResources('AWS::IAM::Policy'))
      expect(text).not.toMatch(/"Action":\s*"\*"/)
      for (const forbidden of ['iam:CreateRole', 'iam:PutRolePolicy', 'iam:AttachRolePolicy', 'cloudformation:CreateStack', 'cloudformation:UpdateStack', 'cloudformation:ExecuteChangeSet']) expect(text).not.toContain(forbidden)
    })

    it('can be parameterised with another repository and branch, and can reuse an existing provider', () => {
      const other = build({ githubRepo: 'example/other', githubBranch: 'release/dev', githubOidcProviderArn: 'arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com' })
      other.tpl.oidc.resourceCountIs('AWS::IAM::OIDCProvider', 0)
      expect(JSON.stringify(other.tpl.oidc.toJSON())).toContain('repo:example/other:ref:refs/heads/release/dev')
    })
  })

  describe('secrets and accounts', () => {
    it('contains no secret values in any template', () => {
      for (const t of Object.values(b.tpl)) {
        const text = JSON.stringify(t.toJSON())
        expect(text).not.toContain('"SecretString"')
        expect(text).not.toMatch(/"MasterUserPassword":\s*"(?!\{\{resolve:secretsmanager)/)
        expect(text).not.toMatch(/"(Password|DB_PASSWORD)":\s*"[^"]+"/)
      }
      // The database password is a dynamic reference resolved by CloudFormation at deploy time.
      expect(JSON.stringify(b.tpl.data.toJSON())).toContain('{{resolve:secretsmanager:')
    })

    it('contains no account ID in the templates when none is given', () => {
      for (const t of Object.values(b.tpl)) expect(JSON.stringify(t.toJSON())).not.toMatch(/\b\d{12}\b/)
    })

    it('contains no account ID in the source files', () => {
      const offenders: string[] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          if (['node_modules', 'cdk.out', 'test', 'package-lock.json'].includes(name)) continue
          const p = path.join(dir, name)
          if (statSync(p).isDirectory()) walk(p)
          else if (/\b\d{12}\b/.test(readFileSync(p, 'utf8'))) offenders.push(path.relative(ROOT, p))
        }
      }
      walk(ROOT)
      expect(offenders).toEqual([])
    })

    it('takes the account and region from parameters and refuses the management account unless allowed', () => {
      const app = new cdk.App({ context: { account: '111111111111', region: 'us-east-2', managementAccountId: '111111111111' } })
      expect(() => readConfig(app, {})).toThrow(/management account/)
      const ok = new cdk.App({ context: { account: '222222222222', region: 'us-east-2', managementAccountId: '111111111111' } })
      expect(readConfig(ok, {}).env).toEqual({ account: '222222222222', region: 'us-east-2' })
      const forced = new cdk.App({ context: { account: '111111111111', managementAccountId: '111111111111', allowManagementAccount: 'true' } })
      expect(readConfig(forced, {}).env.account).toBe('111111111111')
      const fromEnv = new cdk.App()
      expect(readConfig(fromEnv, { CDK_DEFAULT_ACCOUNT: '333333333333', CDK_DEFAULT_REGION: 'eu-west-1' }).env).toEqual({ account: '333333333333', region: 'eu-west-1' })
      expect(() => readConfig(new cdk.App({ context: { account: 'abc' } }), {})).toThrow(/12-digit/)
    })
  })
})

describe('optional night schedule', () => {
  it('scales the service to zero at night and back in the morning, without a fixed desired count', () => {
    const b = build({ nightSchedule: 'true', scheduleTimeZone: 'America/Toronto' })
    b.tpl.application.resourceCountIs('AWS::ApplicationAutoScaling::ScalableTarget', 1)
    b.tpl.application.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
      MinCapacity: 0,
      MaxCapacity: 1,
      ScheduledActions: Match.arrayWith([
        Match.objectLike({ ScalableTargetAction: { MinCapacity: 0, MaxCapacity: 0 }, Timezone: 'America/Toronto' }),
        Match.objectLike({ ScalableTargetAction: { MinCapacity: 1, MaxCapacity: 1 } }),
      ]),
    })
    const svc = Object.values(b.tpl.application.findResources('AWS::ECS::Service'))[0] as { Properties: Record<string, unknown> }
    expect(svc.Properties.DesiredCount).toBeUndefined()
  })
})

describe('database host override (after a restore into a new instance)', () => {
  it('is passed to the service and the migration task only when given, and must be a host name', () => {
    const none = build()
    expect(JSON.stringify(none.tpl.application.toJSON())).not.toContain('DB_HOST_OVERRIDE')
    const b = build({ dbHostOverride: 'ews-dev-restore.abcdefgh.us-east-2.rds.amazonaws.com' })
    for (const t of [b.tpl.application, b.tpl.migrate]) expect(JSON.stringify(t.toJSON())).toContain('"Name":"DB_HOST_OVERRIDE","Value":"ews-dev-restore.abcdefgh.us-east-2.rds.amazonaws.com"')
    expect(() => readConfig(new cdk.App({ context: { dbHostOverride: 'x;rm -rf /' } }), {})).toThrow(/host name/)
  })
})

describe('configuration errors', () => {
  it('rejects an unknown environment, a bad repository and a bad image tag', () => {
    expect(() => readConfig(new cdk.App({ context: { envName: 'prod' } }), {})).toThrow(/Only "dev"/)
    expect(() => readConfig(new cdk.App({ context: { githubRepo: 'nope' } }), {})).toThrow(/owner\/name/)
    expect(() => readConfig(new cdk.App({ context: { imageTag: 'a b' } }), {})).toThrow(/plain tag/)
  })
})
