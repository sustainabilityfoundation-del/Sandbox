import { Stack, type App, type Environment } from 'aws-cdk-lib'
import type { Construct } from 'constructs'

/**
 * Deployment parameters. Nothing here names an AWS account: the account and region come from the command line
 * (`-c account=... -c region=...`) or from the CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION variables that the CDK sets from the
 * active profile. Without either, the stacks are environment-agnostic, which is enough for `cdk synth` and the unit tests.
 */
export interface EwsConfig {
  /** Environment name; only `dev` is defined (production needs its own review, see AWS_ARCHITECTURE.md section 5). */
  envName: 'dev'
  /** Target account and region, undefined when not supplied. */
  env: Environment
  /** Image tag in the ECR repository (a commit SHA). Required to deploy the Migrate and App stacks. */
  imageTag: string
  /** GitHub repository allowed to assume the deploy role ("owner/name") and the branch it may deploy from. */
  githubRepo: string
  githubBranch: string
  /** Re-use an OIDC provider that already exists in the account (one per URL is allowed). */
  existingGithubOidcProviderArn?: string
  /** Optional night-time stop: cron expressions in UTC unless scheduleTimeZone is given (IANA name). */
  nightSchedule?: { stop: { hour: string; minute: string; weekDay?: string }; start: { hour: string; minute: string; weekDay?: string }; timeZone?: string }
  /** Database host to use instead of the one in the secret (after a restore into a new instance, runbook A8), passed as DB_HOST_OVERRIDE. Optional. */
  dbHostOverride?: string
  /** Public origin people use (for example https://dxxxx.cloudfront.net), passed to the API as EWS_PUBLIC_ORIGIN. Optional. */
  publicOrigin?: string
}

const str = (app: App, key: string): string | undefined => {
  const v = app.node.tryGetContext(key)
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function readConfig(app: App, processEnv: NodeJS.ProcessEnv = process.env): EwsConfig {
  const envName = str(app, 'envName') ?? 'dev'
  if (envName !== 'dev') throw new Error(`envName "${envName}" is not defined. Only "dev" exists; production is a separate, reviewed change.`)

  const account = str(app, 'account') ?? processEnv.CDK_DEFAULT_ACCOUNT
  const region = str(app, 'region') ?? processEnv.CDK_DEFAULT_REGION
  if (account && !/^\d{12}$/.test(account)) throw new Error('account must be a 12-digit AWS account ID.')
  if (region && !/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) throw new Error('region must look like us-east-2.')

  // Safety net, not an assumption: workloads belong in a member account. Pass -c managementAccountId=<id> and the app refuses
  // to deploy there unless -c allowManagementAccount=true is also given (an explicit owner decision).
  const management = str(app, 'managementAccountId')
  if (management && account === management && str(app, 'allowManagementAccount') !== 'true') {
    throw new Error('Refusing to deploy into the organization management account. Use the member account, or pass -c allowManagementAccount=true if the owner has decided otherwise.')
  }

  const githubRepo = str(app, 'githubRepo') ?? 'sustainabilityfoundation-del/Sandbox'
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(githubRepo)) throw new Error('githubRepo must be "owner/name".')
  const githubBranch = str(app, 'githubBranch') ?? 'main'
  if (!/^[A-Za-z0-9._\/-]+$/.test(githubBranch)) throw new Error('githubBranch contains unexpected characters.')

  const imageTag = str(app, 'imageTag') ?? 'unset'
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(imageTag)) throw new Error('imageTag must be a plain tag (letters, digits, . _ -).')

  const existingGithubOidcProviderArn = str(app, 'githubOidcProviderArn')
  const dbHostOverride = str(app, 'dbHostOverride')
  if (dbHostOverride && !/^[A-Za-z0-9.-]{3,253}$/.test(dbHostOverride)) throw new Error('dbHostOverride must be a host name.')

  let nightSchedule: EwsConfig['nightSchedule']
  if (str(app, 'nightSchedule') === 'true') {
    nightSchedule = {
      stop: { hour: str(app, 'nightStopHour') ?? '20', minute: '0' },
      start: { hour: str(app, 'nightStartHour') ?? '7', minute: '0', weekDay: 'MON-FRI' },
      timeZone: str(app, 'scheduleTimeZone'),
    }
  }

  return { envName: 'dev', env: { account, region }, imageTag, githubRepo, githubBranch, existingGithubOidcProviderArn, nightSchedule, publicOrigin: str(app, 'publicOrigin'), dbHostOverride }
}

export const NAME = 'Ews'
export const stackName = (cfg: EwsConfig, part: string) => `${NAME}-${cfg.envName[0]!.toUpperCase()}${cfg.envName.slice(1)}-${part}`
export const API_PORT = 8080

/** Deterministic site bucket name: account and region come from the target, never from the code. */
export const siteBucketName = (cfg: EwsConfig, scope: Construct) => `ews-${cfg.envName}-site-${Stack.of(scope).account}-${Stack.of(scope).region}`
