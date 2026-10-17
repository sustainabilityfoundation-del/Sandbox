import * as cdk from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import { Construct } from 'constructs'
import type { DataStack } from './data-stack'
import { type EwsConfig, stackName } from './config'
import { ARM64, apiImage, baseEnvironment, databaseSecrets } from './task'

/**
 * The one-off migration task definition. It is its own small stack so that it can be updated to the new image BEFORE the service:
 *   1. cdk deploy Ews-Dev-Migrate -c imageTag=<sha>        (registers the new task definition revision)
 *   2. aws ecs run-task ... (the command printed as the RunMigration output); wait; check the exit code
 *   3. cdk deploy Ews-Dev-App -c imageTag=<sha>            (only if step 2 exited 0)
 * It runs `npm run db:migrate` (all schemas, the modules' own runners) from the same image as the service, with the database
 * secret only: no assistant key, no file system.
 */
export class MigrateStack extends cdk.Stack {
  readonly taskDefinition: ecs.FargateTaskDefinition

  constructor(scope: Construct, id: string, cfg: EwsConfig, data: DataStack, props: cdk.StackProps = {}) {
    super(scope, id, { ...props, env: cfg.env, stackName: stackName(cfg, 'Migrate'), description: 'EWS dev: one-off database migration task definition (npm run db:migrate).' })

    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'MigrateTask', { family: 'ews-dev-migrate', cpu: 512, memoryLimitMiB: 1024, runtimePlatform: ARM64 })
    this.taskDefinition.addContainer('migrate', {
      image: apiImage(data, cfg),
      command: ['npm', 'run', 'db:migrate'],
      essential: true,
      environment: baseEnvironment(cfg),
      secrets: databaseSecrets(data),
      logging: ecs.LogDrivers.awsLogs({ logGroup: data.logGroup, streamPrefix: 'migrate' }),
    })

    const subnets = data.vpc.publicSubnets.map((s) => s.subnetId).join(',')
    // Plain values for the deploy workflow and the runbook (validated by the caller before use).
    new cdk.CfnOutput(this, 'Cluster', { value: data.cluster.clusterName })
    new cdk.CfnOutput(this, 'TaskSubnets', { value: subnets })
    new cdk.CfnOutput(this, 'TaskSecurityGroup', { value: data.taskSg.securityGroupId })
    new cdk.CfnOutput(this, 'RunMigration', {
      description: 'Run the migration task (replace nothing; wait for it with: aws ecs wait tasks-stopped, then read the exit code)',
      value: `aws ecs run-task --cluster ${data.cluster.clusterName} --task-definition ${this.taskDefinition.family} --launch-type FARGATE --network-configuration awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${data.taskSg.securityGroupId}],assignPublicIp=ENABLED}`,
    })

    cdk.Tags.of(this).add('project', 'ews')
    cdk.Tags.of(this).add('env', cfg.envName)
  }
}
