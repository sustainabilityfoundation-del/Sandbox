import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { type EwsConfig, siteBucketName } from './config'

export const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com'
export const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com'
/** The default CDK bootstrap qualifier. Change it only if `cdk bootstrap --qualifier` was used. */
export const BOOTSTRAP_QUALIFIER = 'hnb659fds'

export interface GithubDeployRoleProps {
  /** "owner/name". The trust policy matches this repository only. */
  repo: string
  /** The one branch whose workflow runs may assume the role. */
  branch: string
  /** Re-use an OIDC provider already present in the account (IAM allows one per URL). */
  existingProviderArn?: string
  roleName?: string
  /** Name of the site bucket (so the role can sync the static build to it and nothing else in S3). */
  siteBucketName: string
}

/**
 * IAM role for GitHub Actions, through OpenID Connect: no long-lived keys. The trust policy requires the token audience
 * sts.amazonaws.com and an exact subject `repo:<owner>/<name>:ref:refs/heads/<branch>`, so a fork, another repository or another
 * branch cannot assume it. The permissions are narrow: assume the CDK bootstrap roles (which hold the real deployment rights),
 * push to the one ECR repository, run the migration task, sync the site bucket, invalidate CloudFront, read stack outputs.
 */
export class GithubDeployRole extends Construct {
  readonly role: iam.Role

  constructor(scope: Construct, id: string, props: GithubDeployRoleProps) {
    super(scope, id)
    const stack = cdk.Stack.of(this)

    const provider = props.existingProviderArn
      ? iam.OidcProviderNative.fromOidcProviderArn(this, 'Provider', props.existingProviderArn)
      : new iam.OidcProviderNative(this, 'Provider', { url: GITHUB_OIDC_URL, clientIds: ['sts.amazonaws.com'] })

    this.role = new iam.Role(this, 'Role', {
      roleName: props.roleName ?? 'ews-gh-deploy-dev',
      description: `GitHub Actions (${props.repo}, branch ${props.branch}) deploy role for the EWS dev environment`,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_OIDC_HOST}:sub`]: `repo:${props.repo}:ref:refs/heads/${props.branch}`,
        },
      }),
    })

    const { account, region, partition } = stack
    const bootstrapRole = (kind: string) => `arn:${partition}:iam::${account}:role/cdk-${BOOTSTRAP_QUALIFIER}-${kind}-role-${account}-${region}`
    this.role.addToPolicy(new iam.PolicyStatement({
      sid: 'AssumeCdkBootstrapRoles',
      actions: ['sts:AssumeRole'],
      resources: ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map(bootstrapRole),
    }))
    this.role.addToPolicy(new iam.PolicyStatement({ sid: 'EcrLogin', actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }))
    this.role.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrPush',
      actions: ['ecr:BatchCheckLayerAvailability', 'ecr:BatchGetImage', 'ecr:CompleteLayerUpload', 'ecr:DescribeImages', 'ecr:GetDownloadUrlForLayer', 'ecr:InitiateLayerUpload', 'ecr:PutImage', 'ecr:UploadLayerPart'],
      resources: [`arn:${partition}:ecr:${region}:${account}:repository/ews/api`],
    }))
    this.role.addToPolicy(new iam.PolicyStatement({
      sid: 'RunMigrationTask',
      actions: ['ecs:RunTask'],
      resources: [`arn:${partition}:ecs:${region}:${account}:task-definition/ews-dev-migrate:*`],
      conditions: { ArnEquals: { 'ecs:cluster': `arn:${partition}:ecs:${region}:${account}:cluster/ews-dev` } },
    }))
    this.role.addToPolicy(new iam.PolicyStatement({
      sid: 'PassMigrationRoles',
      actions: ['iam:PassRole'],
      resources: [`arn:${partition}:iam::${account}:role/Ews-Dev-Migrate-*`],
      conditions: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
    }))
    this.role.addToPolicy(new iam.PolicyStatement({
      sid: 'ObserveEcs',
      actions: ['ecs:DescribeTasks', 'ecs:DescribeServices', 'ecs:DescribeTaskDefinition', 'ecs:ListTasks', 'ecs:StopTask'],
      resources: ['*'],
    }))
    this.role.addToPolicy(new iam.PolicyStatement({
      sid: 'SyncSiteBucket',
      actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [`arn:${partition}:s3:::${props.siteBucketName}`, `arn:${partition}:s3:::${props.siteBucketName}/*`],
    }))
    this.role.addToPolicy(new iam.PolicyStatement({ sid: 'Invalidate', actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'], resources: [`arn:${partition}:cloudfront::${account}:distribution/*`] }))
    this.role.addToPolicy(new iam.PolicyStatement({ sid: 'ReadStackOutputs', actions: ['cloudformation:DescribeStacks'], resources: [`arn:${partition}:cloudformation:${region}:${account}:stack/Ews-*/*`] }))
    this.role.addToPolicy(new iam.PolicyStatement({ sid: 'ReadLogs', actions: ['logs:GetLogEvents', 'logs:FilterLogEvents', 'logs:DescribeLogStreams'], resources: [`arn:${partition}:logs:${region}:${account}:log-group:/ews/dev/api:*`] }))
  }
}

/** Account-level stack: the identity provider (or a reference to an existing one) and the deploy role. */
export class GithubOidcStack extends cdk.Stack {
  readonly deploy: GithubDeployRole

  constructor(scope: Construct, id: string, cfg: EwsConfig, props: cdk.StackProps = {}) {
    super(scope, id, { ...props, env: cfg.env, stackName: `Ews-GithubOidc`, description: 'EWS: GitHub Actions OIDC provider and the dev deploy role (limited to one repository and branch).' })
    this.deploy = new GithubDeployRole(this, 'Deploy', {
      repo: cfg.githubRepo,
      branch: cfg.githubBranch,
      existingProviderArn: cfg.existingGithubOidcProviderArn,
      siteBucketName: siteBucketName(cfg, this),
    })
    new cdk.CfnOutput(this, 'DeployRoleArn', { description: 'The only value GitHub needs (repository variable AWS_DEPLOY_ROLE_ARN)', value: this.deploy.role.roleArn })
    cdk.Tags.of(this).add('project', 'ews')
  }
}
