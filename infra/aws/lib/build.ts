import type * as cdk from 'aws-cdk-lib'
import { AppStack } from './app-stack'
import { type EwsConfig, stackName } from './config'
import { DataStack } from './data-stack'
import { EdgeStack } from './edge-stack'
import { GithubOidcStack } from './github-oidc'
import { MigrateStack } from './migrate-stack'

/**
 * Deployment order: Ews-GithubOidc (once per account, optional) and Data first; push the image; Migrate; run the task; App; Edge.
 * See docs/infrastructure/DEPLOYMENT_RUNBOOK.md. Stack ids equal stack names so `cdk deploy Ews-Dev-Data` works.
 */
export function buildApp(app: cdk.App, cfg: EwsConfig) {
  const oidc = new GithubOidcStack(app, 'Ews-GithubOidc', cfg)
  const data = new DataStack(app, stackName(cfg, 'Data'), cfg)
  const migrate = new MigrateStack(app, stackName(cfg, 'Migrate'), cfg, data)
  const application = new AppStack(app, stackName(cfg, 'App'), cfg, data)
  const edge = new EdgeStack(app, stackName(cfg, 'Edge'), cfg, application)
  return { oidc, data, migrate, application, edge }
}
