# Deployment runbook (skeleton)

Status: **skeleton**, 17 October 2026, aws-infrastructure agent (phase 1). Sections marked *TBD* are completed in increments A-E of
[AWS_ARCHITECTURE.md](AWS_ARCHITECTURE.md) §11, when the infrastructure exists. Nothing in this file has been run against AWS yet.
Never paste secret values into a terminal transcript, issue or document. Never run `secretsmanager get-secret-value` while screen-sharing or logging.

## 1. Prerequisites

- AWS account ID and region (owner decisions O1, O2); AWS CLI v2; Node 24; Docker with buildx (ARM64); access through SSO or the GitHub OIDC roles,
  never long-lived keys.
- GitHub environments `dev` and `production` (owner as required reviewer for `production`); repository variables `AWS_ACCOUNT_ID`, `AWS_REGION`.

## 2. Read-only inventory (phase 1, run before anything is created)

Run with a read-only role in the chosen region and record the results (no values of secrets) in DEPLOYMENT_AUDIT.md §2:

```sh
aws sts get-caller-identity
aws amplify list-apps
aws amplify get-app --app-id <id>                 # platform, repository, customRules (rewrites), basic auth enabled (not the credentials)
aws amplify list-branches --app-id <id>
aws amplify list-jobs --app-id <id> --branch-name main --max-items 20
aws rds describe-db-instances
aws rds describe-db-clusters
aws lightsail get-relational-databases
aws lightsail get-container-services
aws ecs list-clusters
aws ec2 describe-instances --query "Reservations[].Instances[].[InstanceId,State.Name,Tags]"
aws lambda list-functions --query "Functions[].FunctionName"
aws apprunner list-services
aws cloudfront list-distributions --query "DistributionList.Items[].[Id,DomainName,Comment]"
aws s3 ls
aws secretsmanager list-secrets --query "SecretList[].Name"   # names only
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
aws iam list-open-id-connect-providers
aws ce get-cost-and-usage --time-period Start=<first of last month>,End=<first of this month> --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE
```

## 3. Deploy from scratch (new account) *TBD in increments A-B*

1. `npx cdk bootstrap aws://<account>/<region>` (once per account and region).
2. Deploy the `GitHubOidc` stack (OIDC provider and deploy roles).
3. `npx cdk diff` then `npx cdk deploy Ews-Dev-Network Ews-Dev-Data` (review the change set; approval for billable resources).
4. Database bootstrap: create database `ews` and role `ews_app` (DATABASE_DEPLOYMENT.md §3).
5. Build and push the API image; deploy `Ews-Dev-App` and `Ews-Dev-Edge`.
6. Run the migrate task (§5); then the smoke test.

## 4. Update the application *TBD in increment C*

Normal path: merge to `main`; CI passes; `deploy.yml` deploys dev. Prod: run `deploy.yml` with environment `production` and the image digest
from the dev run; approve in GitHub.

## 5. Apply migrations *command implemented; pipeline TBD in increment C*

Command (inside the API image, with `EWS_DEPLOYED=1`, `EWS_PG=external`, `DATABASE_URL`): `npx tsx services/api/scripts/db.ts migrate`
(locally `npm run db:migrate`). Exit 0 means all nine schemas are current; non-zero means stop. `... migrate --check` is read-only and exits 1
when a migration is pending or a checksum drifted. After a deploy: `curl -s https://<cloudfront>/api/ready` (200 `ready`); liveness is `/health`.

`aws ecs run-task` with the current task definition and command override `migrate`; wait with `aws ecs wait tasks-stopped`; read the exit code
with `aws ecs describe-tasks`; logs in `/ews/<env>/api`, stream prefix `migrate`. Prod: snapshot first (§8).

## 6. Inspect logs and diagnose failures *TBD*

- Logs: `aws logs tail /ews/<env>/api --since 30m --follow` (JSON; 5xx entries carry `errorId`, which the client shows).
- Health: `curl -s https://<cloudfront>/api/health`.
- Service events: `aws ecs describe-services --cluster ews-<env> --services api --query "services[0].events[:10]"`.
- Common failures: task cannot pull image (execution role, ECR); task cannot read secret (execution role policy); health check failing
  (database security group, `EWS_PG` not `external`, TLS bundle); migration checksum mismatch (an applied file was edited); 401 on every request
  (identity configuration, decision D3).

## 7. Recover from an unsuccessful deployment *TBD*

- Migration failed: nothing to roll back in the service; fix forward.
- New version unhealthy: the ECS circuit breaker restores the previous task definition; confirm with `describe-services`; otherwise
  `aws ecs update-service --task-definition <previous revision>`.
- Frontend broken: re-run the frontend step of the last good revision (`s3 sync` of its `dist/`, invalidate `index.html`).
- Infrastructure change failed: CloudFormation rolls the stack back automatically; read the stack events.

## 8. Restore backups *TBD; drill in increment E*

Restore a snapshot or a point in time to a **new** instance (`aws rds restore-db-instance-to-point-in-time` / `restore-db-instance-from-db-snapshot`),
verify it with the `status` command and a known test project, then change the database host in the environment's configuration and redeploy.
Keep the old instance until the owner agrees to delete it. EFS: restore through AWS Backup to a new file system or a directory.

## 9. Stop and start dev *TBD*

Scheduled rule or manual: `aws ecs update-service --desired-count 0`, `aws rds stop-db-instance`; reverse order to start.
