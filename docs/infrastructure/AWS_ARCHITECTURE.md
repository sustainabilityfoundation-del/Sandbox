# AWS architecture: proposed plan (for review, not implemented)

Status: **Proposed**, 17 October 2026, aws-infrastructure agent (phase 1). Nothing here has been provisioned. Implementation starts only after the
coordinator's review and the owner's approval of the decisions in §12 and the cost in [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md).
Evidence for the current state: [DEPLOYMENT_AUDIT.md](DEPLOYMENT_AUDIT.md). Database detail: [DATABASE_DEPLOYMENT.md](DATABASE_DEPLOYMENT.md).
Brief: [aws-deployment-brief.md](../specifications/aws-deployment-brief.md).

## 1. Summary

- **Today (audit):** an AWS Amplify Hosting static build (likely; not verifiable without AWS access) serving the GLB viewer at the root and the
  workspace at `/workspace/`. No backend, no database and no `/api` routing exist in AWS, so every module that needs `services/api` fails.
- **Recommendation:** per environment, one CloudFront distribution in front of an S3 bucket (workspace and viewer) and, for `/api/*`, an
  internal Application Load Balancer reached through a CloudFront VPC origin; one ECS Fargate task (ARM64) running the existing `services/api`
  image; Amazon RDS for PostgreSQL 17 (single-AZ) in private subnets; EFS for `STORAGE_DIR` until S3 adapters exist; Secrets Manager; CloudWatch.
  No NAT gateway, no interface endpoints. Defined with **AWS CDK v2 in TypeScript** (Apache-2.0); deployed by GitHub Actions with OIDC;
  production behind a GitHub environment with required approval.
- **Estimated cost:** about USD 53/month for dev and 68/month for prod, always on (us-east-1 list prices, Assumed). About 35/month for dev when it is
  stopped outside working hours. Details and cheaper options in AWS_COST_ESTIMATE.md.
- **Blocking decision:** the deployed backend has no production authentication (audit §1.7). The owner must choose how people sign in (D3) before any
  environment holds real data.

## 2. Principles applied (brief §8)

Same-origin hosting (no CORS, no build-time API URL: the workspace already uses relative `/api` paths); one backend process with all installed
modules as today (no split per module, schema ownership stays in each module's migrations); existing migration framework; low cost over high
availability (single task, single-AZ database, no NAT); nothing always-on that can be avoided in dev (scheduled stop); everything in IaC so a new
account can be built from scratch; destructive changes guarded (§10).

## 3. Current and target topology

```
Current (Assumed)                         Target, per environment (dev, prod)

 Browser                                   Browser
   |                                         |  HTTPS (*.cloudfront.net or owner domain)
 Amplify Hosting (static dist/)            CloudFront ── default ──> S3 bucket (dist/: /workspace/, viewer)   [OAC, private]
   /            GLB viewer                   |        └─ /api/* ──> VPC origin ──> internal ALB (private subnets)
   /workspace/  workspace                    |                                        |
   /api/*       (nothing; SPA fallback)      |                                  ECS Fargate service, 1 task (public subnet,
                                             |                                  public IP for egress only, inbound from ALB SG only)
                                             |                                    |            |              |
                                             |                          RDS PostgreSQL 17   EFS (STORAGE_DIR)   Secrets Manager
                                             |                          (private subnets)   (private subnets)   (DB, EWS_ASSISTANT_KEY)
                                             └─ CloudWatch Logs and alarms; ECR (images); GitHub OIDC roles
```

## 4. Components

### 4.1 Backend hosting: compared

| Option | Fit | Monthly (dev, Assumed) | Verdict |
| --- | --- | --- | --- |
| **ECS Fargate + internal ALB** (recommended) | Runs the existing container unchanged; long-lived SSE streams fine (ALB idle timeout configurable, streams send keep-alives every 15 s); rolling deploys with circuit-breaker rollback; private RDS; scales to more tasks later. | ~36 (task, IPv4, ALB) | Recommended |
| Existing deployment (Amplify Hosting) | Static hosting only; Amplify's managed backends are Lambda/AppSync (Gen 2), not a long-running Fastify process with SSE and an advisory-locked migrator. | n/a | Keep at most as a static host during transition |
| App Runner | Simple, HTTPS included, can idle cheaply. But a 120 s request limit cuts SSE streams (they resume, at a cost of reconnects); reaching a private RDS needs a VPC connector, after which outbound traffic to AI providers needs a NAT gateway (~33/month); AWS has changed App Runner's availability to new customers, which must be checked for this account (Assumed). | ~5 idle + active + NAT | Not recommended |
| Lightsail container service + Lightsail database | Cheapest fixed price (micro container 10, database 15), HTTPS endpoint included. Separate from VPC networking, limited IAM/OIDC and IaC support, no ECS-style rollback, harder migration path to production scale. | ~25 | Fallback if cost dominates |
| EC2 (t4g.small, Docker) | Cheap (~12) but a server to patch and back up; no managed rollout. | ~15 + ALB or Caddy | Not recommended |
| Lambda + API Gateway | Would need an adapter for Fastify; SSE streams, advisory-locked start-up migrations and event-hub polling do not fit a request-scoped runtime. | low | Not suitable without redesign |

Fargate task: ARM64 (Graviton), 0.5 vCPU / 1 GB to start (CAD kernel runs in the browser; the server depends on `@ews/cad-kernel` but heavier
server work should be measured in increment B), desired count 1, `minimumHealthyPercent 100 / maximumPercent 200` for zero-downtime
rolling replacement, deployment circuit breaker with rollback, health check `/api/health`, stop timeout 30 s (SIGTERM is handled).
Container: Node 24 (as CI), `npm ci`, run with `tsx` as `npm run dev:api` does today (no compile step exists; a compiled build is a later
optimisation), non-root user, `API_HOST=0.0.0.0`, `EWS_PG=external`, `NODE_ENV=production` (subject to D3), `SEED_ON_START=false`.

### 4.2 Database: RDS for PostgreSQL 17

Single-AZ `db.t4g.micro` (dev) and `db.t4g.small` (prod), gp3 20 GB with storage autoscaling cap, encrypted (AWS-managed KMS key), private
subnets only, security group allowing 5432 from the API task and the migration task only, master password managed by RDS in Secrets Manager,
automated backups 7 days (dev) / 14 days (prod) with point-in-time recovery, deletion protection and snapshot-on-delete in prod, TLS required.
No extensions are needed (audit §1.4). Aurora Serverless v2 with auto-pause is the alternative for a mostly idle dev environment. Before creating
anything, existing databases are listed (brief §2). Full design: DATABASE_DEPLOYMENT.md.

### 4.3 Workspace hosting: S3 and CloudFront

Private S3 bucket per environment, Origin Access Control, `dist/` uploaded by CI (hashed assets with long cache; `index.html` files with
`no-cache`). Behaviours: `/api/*` to the ALB VPC origin (caching disabled, all viewer headers including `X-Dev-User` and `Last-Event-ID`
forwarded, all methods); default to S3. A CloudFront Function maps `/workspace` and `/workspace/<path without dot>` to `/workspace/index.html`
(the workspace routes with query parameters, so this is only for direct loads) and redirects `/` to `/workspace/` unless the owner keeps the GLB
viewer at the root (D4). HTTPS on the `*.cloudfront.net` name needs no domain; a custom domain needs an ACM certificate in us-east-1 and DNS.
CloudFront to the internal ALB uses HTTP inside AWS for the prototype (no domain needed); HTTPS to the ALB once a domain exists.
Security headers (HSTS, `X-Content-Type-Options`, frame options) through a response headers policy. The bundle contains no secrets (audit §1.8).

### 4.4 Artifact and blob storage

Today `STORAGE_DIR` holds Requirements import/export objects and Project Management blobs (documents, attachments, generated images); CAD and
System Model data are in PostgreSQL; the workspace `FilesService` is browser memory only (audit §1.5).
- **Phase 2-3 (no code change):** EFS file system mounted at `/data/objects`, `STORAGE_DIR=/data/objects`, encrypted, AWS Backup daily. One
  task writes at a time; the stores are content-addressed with atomic writes, so a second task later is safe.
- **Later (module owners):** S3 adapters implementing the existing `BlobStore` (Projects) and `ObjectStorage` (Requirements) interfaces, one
  private bucket per environment with versioning, lifecycle to Intelligent-Tiering, and a one-off copy from EFS. These are changes in
  `services/projects` and `services/requirements`, owned by those modules, not by infrastructure.

### 4.5 Secrets Manager

| Secret | Use | Injected as |
| --- | --- | --- |
| RDS master secret (RDS-managed, rotation available) | Administration and the first database bootstrap only | not given to the API task |
| `ews/<env>/db-app` (username, password) | Application role that owns the nine schemas | `DATABASE_URL` assembled by the task from a template plus the secret (ECS `secrets` field; see DATABASE_DEPLOYMENT.md §3) |
| `ews/<env>/assistant-key` (32 random bytes, base64) | `EWS_ASSISTANT_KEY`, encryption of stored AI connections | ECS `secrets` (never in the task definition text, logs or outputs) |
| `ews/<env>/edge-gate` (only if D3 = gate) | Access gate credentials (CloudFront KeyValueStore copy) | CloudFront Function |

No AI provider key is stored for deployed environments (§8). Secrets are created by IaC with generated values; nobody types or prints them.

### 4.6 Networking

One VPC per environment (or one shared VPC with per-environment subnets, D6), two Availability Zones (RDS needs a subnet group across two).
Public subnets: Fargate tasks with a public IP for outbound traffic (ECR, Secrets Manager, CloudWatch, AI providers); their security group has no
inbound rule except from the ALB security group. Private subnets: internal ALB, RDS, EFS mount targets. No NAT gateway and no interface
endpoints (cost); a free S3 gateway endpoint. VPC flow logs off in dev, rejected-only in prod.

### 4.7 IAM and GitHub OIDC

- GitHub OIDC identity provider (`token.actions.githubusercontent.com`), audience `sts.amazonaws.com`.
- `ews-gh-plan`: read-only plus CDK diff lookups; trust limited to `repo:sustainabilityfoundation-del/Sandbox:*` on pull requests from the same
  repository (fork pull requests do not get OIDC credentials for it).
- `ews-gh-deploy-dev`: trust `sub = repo:sustainabilityfoundation-del/Sandbox:environment:dev`; may assume the CDK bootstrap deploy roles, push to
  ECR, run the migration task, update the service, sync the dev bucket, invalidate dev CloudFront.
- `ews-gh-deploy-prod`: same for `environment:production`, which has required reviewers.
- ECS task execution role: pull from ECR, write logs, read only the two secrets of its environment.
- ECS task role: EFS client access to its access point (later: S3 bucket read/write for blobs). No wildcard data permissions.
- No long-lived access keys anywhere. **The repository is public** (audit §0): workflow files and IaC are visible, so nothing secret may live in
  them, and deploy jobs must never run on `pull_request_target` or fork events.

### 4.8 CloudWatch

Log group per environment (`/ews/<env>/api`, retention 30 days dev, 90 days prod) receiving the existing structured JSON logs; migration task
logs in the same group with stream prefix `migrate`. Alarms to an SNS topic emailing the owner: running tasks < 1, ALB target 5xx and unhealthy
hosts, RDS CPU, free storage and connection count, failed deployment (EventBridge rule on ECS service deployment failure). Container Insights off
(cost); can be enabled during load investigations.

## 5. Environments and promotion

| | dev | prod |
| --- | --- | --- |
| Trigger | push to `main` after CI passes, or manual dispatch with a revision | manual dispatch of an image digest already deployed and smoke-tested on dev |
| Approval | none | GitHub environment `production` with the owner as required reviewer |
| Data | disposable test projects; may be reset only by an explicit, separate runbook procedure | persistent; no reset path exists in the pipeline |
| Schedule | optional stop 20:00-07:00 and weekends (ECS desired count 0, RDS stop) | always on |
| Database | db.t4g.micro, 7-day backups | db.t4g.small, 14-day backups, deletion protection, pre-deploy snapshot |

## 6. CI/CD pipeline (brief §6)

Existing `ci.yml` stays as the quality gate (type check, unit and database tests, builds, licence checks, SBOM); deployment workflows are added beside it.

| Brief step | Where |
| --- | --- |
| 1-4 checkout, install, typecheck and tests, build | existing `ci.yml` (must be green; see audit C10 for current instability) |
| 5 container image | `deploy.yml`: build ARM64 image on a GitHub ARM runner, tag with the commit SHA, push to ECR, record the digest |
| 6 validate infrastructure | `infra.yml`: `cdk synth`, cdk-nag checks, `cdk diff` posted to the job summary; on pull requests touching `infra/` too |
| 7 deploy approved infrastructure | `cdk deploy` with change-set review: fails if the change set would replace or delete the RDS instance, EFS, S3 buckets or secrets (§10) |
| 8 migrations | one-off ECS task with the new image running the migrate-all command; deployment stops on a non-zero exit (DATABASE_DEPLOYMENT.md §4) |
| 9 backend | register the task definition with the new image digest; ECS rolling update; wait for steady state; circuit breaker rolls back |
| 10 frontend | `aws s3 sync dist/` (assets first, `index.html` last), CloudFront invalidation of `index.html` paths |
| 11 smoke tests | script against the CloudFront URL: workspace loads, `/api/health` returns JSON `ok` with database reachable, migration status complete, one read per module API, then the dedicated test project flow of brief §7 on dev |
| 12 report | job summary with revision, image digest, migration versions applied, smoke results; failure alarm |

## 7. Migrations at deploy

Uses the existing per-schema runners (checksums, advisory locks, one transaction per migration). A small platform change adds one command that
applies all nine schemas and exits (audit C4). The pipeline runs it as a one-off task before the service update; the API also still applies
migrations at start-up as today (idempotent, same locks), so a task that starts first cannot run against an unmigrated schema. Failure: the
migration in error is rolled back, the service is not updated and the previous version keeps serving (migrations are additive by the
repository's rules). Recovery is forward-fix; prod takes a snapshot before migrating, and point-in-time restore is the last resort. Details,
compatibility checks and the restore procedure: DATABASE_DEPLOYMENT.md §4-§6.

## 8. The owner's AI rules in deployed environments

- **No developer keys reach browsers or servers in AWS.** The bundle reads no keys (audit §1.8). Deployed tasks never receive `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `XAI_API_KEY` or `EWS_AI_MODE`; the IaC defines no such variables and a CI check
  refuses a task definition that contains them.
- **Default AI mode is `user`** (people's own connections). With `NODE_ENV=production` the server forces it and ignores mock and development modes.
  Sign in with ChatGPT requires a loopback origin, so deployed users connect with their own API key. Automated smoke tests never use the owner's
  AI connection; they do not exercise the assistant beyond reading its policy.
- **The connection encryption key** `EWS_ASSISTANT_KEY` lives in Secrets Manager per environment and is injected only into the API task. Losing or
  rotating it makes stored connections unreadable (people reconnect); it is therefore created once, kept on stack deletion, and backed up only
  by Secrets Manager's own retention.

## 9. Infrastructure-as-code tool: open-source evaluation

Follows [the evaluation template](../architecture/open-source-evaluation-template.md); to be copied into an ADR when the coordinator accepts it
(next free number after 0087). Licences as known on 17 October 2026; each is to be re-verified from the upstream LICENSE file when the dependency
is added in increment A and recorded in [docs/dependencies.md](../dependencies.md).

| Candidate | Licence (category, strategy §2) | Maturity and fit |
| --- | --- | --- |
| **AWS CDK v2** (`aws-cdk-lib`, `aws-cdk` CLI, `constructs`) | Apache-2.0 (preferred) | Very mature; TypeScript like the rest of the repository; state held by CloudFormation (no state bucket to secure); change sets give a reviewable plan; automatic stack rollback on failed deploys; high-level ECS, RDS, CloudFront constructs; cdk-nag (Apache-2.0) for policy checks. AWS-only; replacement of resources on some property changes must be guarded. |
| OpenTofu | MPL-2.0 (conditional; file-level copyleft, no obligation when used as an unmodified CLI) | Mature fork of Terraform 1.5 under the Linux Foundation; HCL; explicit `tofu plan` files; S3 state with native locking. Second language in the repository; state bucket to protect. Strong runner-up, best if multi-cloud matters. |
| Terraform (HashiCorp) | BUSL-1.1 since 1.6 (not open source; commercial category) | Most widely used, same model as OpenTofu. Licence prevents use in competing offerings and is outside the preferred list; no technical advantage here over OpenTofu. Not chosen. |
| Pulumi | Apache-2.0 (preferred) | TypeScript, good AWS coverage; state in Pulumi Cloud (commercial service) or a self-managed S3 backend; smaller community for AWS-only stacks than CDK. |
| AWS SAM / plain CloudFormation | Apache-2.0 (SAM CLI) | Verbose YAML for ECS/RDS/CloudFront; no abstraction gain over CDK. |
| SST v3 | MIT | Opinionated application framework on Pulumi; fast-moving, less suited to RDS and ECS operations control. |
| Internal scripts (AWS CLI) | n/a | Not reproducible or reviewable as a plan. Rejected. |

**Decision proposed: AWS CDK v2, TypeScript.** Placed in `infra/aws/` as its own npm project (own `package.json` and lockfile, **not** an npm
workspace) so the monorepo's `npm ci`, typecheck and tests are unaffected. One stack set per environment: `Network`, `Data` (RDS, EFS, secrets;
termination protection on), `App` (ECR, ECS, ALB), `Edge` (S3, CloudFront), plus a one-time `Bootstrap`/`GitHubOidc` stack. CDK bootstrap creates
an S3 assets bucket and roles (small cost). Upstream contribution: none planned (strategy §7).

## 10. Risks to existing data

| Risk | Mitigation |
| --- | --- |
| An existing AWS deployment holds data this audit could not see (Amplify has no database, so likely none; an unknown RDS or EC2 database is possible) | Read-only inventory first (O1, runbook §2). Nothing existing is modified, replaced or deleted; the new stacks use new names. Amplify is left running until the owner retires it. |
| IaC replaces or deletes a stateful resource | RDS, EFS, buckets and secrets get `RemovalPolicy.RETAIN` (snapshot for RDS), deletion protection, stack termination protection; the pipeline parses the change set and refuses any `Replace` or `Remove` on them without a manual, approved procedure. |
| A migration damages data | Migrations are additive (AGENTS.md); one transaction each; prod snapshot before migrating; point-in-time recovery 14 days. |
| Container starts embedded PostgreSQL and data disappears | Code change C3 (fail fast when deployed without `EWS_PG=external`); IaC sets the variable. |
| Development seed data in prod | `SEED_ON_START=false` set explicitly; smoke test asserts no development users exist in prod. |
| Blobs lost on task replacement | EFS (§4.4) before any real data is stored. |
| Encryption key lost | §8. |
| Public repository | Infrastructure code and workflows are public; no secrets, account IDs only as variables. Whether the repository should be public is an owner question (AGENTS.md forbids disclosing proprietary architecture without authorization). |

## 11. Phased increments and acceptance checks

Mapped to the brief's phases (§11). Each increment ends in a committed checkpoint and a report; billable steps start only after approval.

| Increment | Brief phase | Content | Acceptance check |
| --- | --- | --- | --- |
| R0 Read-only inventory | 1 Audit | Owner (or a read-only role) runs the runbook §2 commands; findings added to DEPLOYMENT_AUDIT.md | Amplify app, branch, rewrites and last jobs known; list of databases, ECS, EC2, Lambda in the chosen region is recorded |
| A IaC skeleton, plan only | 2 Repair (prep) | `infra/aws` CDK app with all stacks; Dockerfile; code changes C3, C4, C7 by the Platform owner; `cdk synth` and cdk-nag in CI; no deploy | `cdk synth` succeeds for dev and prod; cdk-nag has no unsuppressed errors; the image builds and starts locally against Docker Compose PostgreSQL with `NODE_ENV=production` and refuses embedded mode; nothing created in AWS |
| B Dev environment | 2 Repair, 3 Persistence | Owner approves cost; `cdk deploy` dev from a workstation or the deploy role; first migration task; identity per D3 | CloudFront URL loads the workspace; `/api/health` ok with database reachable; nine `schema_migrations` tables with 27 rows; a test project, requirement, System Model element and CAD document created and read back; still present after `ecs update-service --force-new-deployment` |
| C CI/CD | 4 Automation | `deploy.yml` (dev), `infra.yml`, smoke-test script, OIDC roles; Amplify auto-build stopped (D4) | A push to `main` with green CI deploys dev without human steps; a deliberately failing migration on a throw-away branch stops the deployment and leaves the old version serving; job summary shows revision, digest and migrations |
| D Prod with approval | 4 Automation | prod stacks; `production` environment with required reviewer; promotion by image digest; pre-deploy snapshot | Prod deploy waits for the owner's approval; promotion uses the dev-tested digest; no development users or seed project in prod; alarms reach the owner |
| E End-to-end verification | 5 Verification | Brief §7 list on dev then prod with a dedicated test project; runbook completed (restore drill on dev) | Every §7 item demonstrated or reported as not implemented; restore from snapshot into a new instance verified on dev; DEPLOYMENT_RUNBOOK.md complete |

## 12. Owner decisions and access needed

| # | Decision or access | Recommendation |
| --- | --- | --- |
| O1 | Read-only AWS access for the audit (IAM user or role with `ReadOnlyAccess`, or the owner runs runbook §2 and pastes results), and the account ID | needed before increment B |
| O2 | AWS region | the region of the existing Amplify app, or one near the owner (for example eu-west-2 or us-east-1) |
| O3 | Approval of the monthly cost (AWS_COST_ESTIMATE.md) and of creating billable resources | dev first; prod after E on dev |
| D3 | Sign-in for deployed environments: (a) development identities behind an edge access gate (CloudFront Function with a shared password; prototype only; needs C5: an explicit identity switch independent of `NODE_ENV`); (b) Amazon Cognito at the ALB with the user mapped to `platform.users` (small platform change); (c) OIDC bearer tokens in the API and workspace (larger platform change) | (a) for dev now; (b) or (c) before prod holds real users. With (a) and `SEED_ON_START=false` the database has no users, so C5 also needs a way to create the named people (platform users and memberships) without the sample project and data |
| D4 | The existing Amplify app: keep (add `/api` proxy rewrite, root redirect) or retire after dev works on CloudFront; stop its auto-build on every push to `main` (about 60 pushes a day) | retire after increment B is accepted |
| D5 | Blob storage: EFS now, S3 adapters later (module owners) | yes |
| D6 | One AWS account with dev and prod stacks, or separate accounts (AWS Organizations) | one account for the prototype |
| D7 | Domain name (Route 53 or external DNS) for HTTPS on a custom name | optional; CloudFront names work without one |
| D8 | GitHub: create environments `dev` and `production` (owner as required reviewer); repository variables for account ID and region; whether the repository stays public | needed for increment C |
| D9 | Alarm e-mail address | owner's choice |

Code changes outside infrastructure (owner: Platform/coordinator unless noted): C3 fail-fast on embedded mode when deployed, C4 migrate-all
command, C5 identity switch (if D3 = a), C7 public origin override; later S3 adapters (Projects, Requirements). Each is small and additive.
