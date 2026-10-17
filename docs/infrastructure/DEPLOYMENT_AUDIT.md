# AWS deployment audit (phase 1)

Status: phase 1 audit, 17 October 2026, aws-infrastructure agent, branch `infra/aws-audit` (base `main` 20409ea).
Brief: [aws-deployment-brief.md](../specifications/aws-deployment-brief.md) §1 and §12. Proposed target: [AWS_ARCHITECTURE.md](AWS_ARCHITECTURE.md).
Related: [DATABASE_DEPLOYMENT.md](DATABASE_DEPLOYMENT.md), [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md), [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

Every statement is marked **Verified** (with how) or **Assumed**. Nothing in AWS or GitHub was changed. No test suite or build was run
(the machine is shared with an integration run).

The **live inventory** below (added on branch `infra/aws-audit-live`) replaces the assumptions in §0, §2 and §4 about AWS. §1 (the repository)
still stands.

## Live inventory (17 October 2026)

Read-only, run 13:00-13:45 UTC with AWS CLI 2.38.1, profile `engineering-dev`. Every call was a describe, list or get call. No secret values were
retrieved: Amplify environment variables were read only as name lists, and the console build spec was printed with a redaction filter.
The deployed site was fetched with HTTP GET only. No database connection was made, no CloudWatch logs exist to read, and no test or build was run.
"Verified (cmd)" names the command used. "Inferred" means a conclusion drawn from verified facts.

### L1. Account and access
- **Verified** (`sts get-caller-identity`): account `477165397126`; principal
  `arn:aws:sts::477165397126:assumed-role/AWSReservedSSO_ReadOnlyAccess_6a7d3449274e53a3/kim-dev` (IAM Identity Center, read-only permission set).
  The profile's default region is `us-east-2`.
- **Verified** (`organizations describe-organization`): this account is the **management account** of organization `o-wz12ylch90`.
- **Verified** (`iam list-roles`, `iam list-users`): no IAM users; the only roles are AWS service-linked roles and the SSO read-only role.
  **No GitHub OIDC provider** (`iam list-open-id-connect-providers`: empty), so no role trusts GitHub.
- **Verified** (`kms describe-key`): one customer-managed multi-region KMS key in us-east-2, created 17 October 2026 at 11:43 UTC. Its description
  says it is the IAM Identity Center key, so it is not an application resource. It has no alias.

### L2. Inventory across all 17 enabled regions
**Verified** (`ec2 describe-regions`, then per region: `amplify list-apps`, `ec2 describe-instances`, `ecs list-clusters`,
`ecr describe-repositories`, `apprunner list-services`, `lambda list-functions`, `apigateway get-rest-apis`, `apigatewayv2 get-apis`,
`elasticbeanstalk describe-environments`, `rds describe-db-instances`, `rds describe-db-clusters`, `elasticache describe-cache-clusters`,
`efs describe-file-systems`, `secretsmanager list-secrets`, `ssm describe-parameters`, `cloudformation list-stacks`, `logs describe-log-groups`,
`cloudwatch describe-alarms`, `ec2 describe-vpcs` (non-default), `acm list-certificates`). Lightsail instances, container services and
databases were checked in the 14 regions where Lightsail runs.

| Resource | Result |
| --- | --- |
| Amplify | **1 app, us-east-2 only** (details L3) |
| EC2, ECS, ECR, App Runner, Lambda, API Gateway (REST and HTTP), Elastic Beanstalk | **none in any region**. App Runner returned an error in 6 regions where it is not offered. |
| RDS instances, Aurora clusters, Lightsail databases, ElastiCache | **none in any region** |
| EFS, Secrets Manager secrets, SSM parameters | **none in any region** |
| CloudFormation stacks, CloudWatch log groups, CloudWatch alarms, ACM certificates | **none in any region** |
| VPCs | default VPC only (us-east-2 `172.31.0.0/16`, default security group only); no non-default VPC in any region |
| S3 buckets (`s3api list-buckets`), CloudFront distributions (`cloudfront list-distributions`) | **none**. Amplify Hosting's storage and CDN are AWS-managed and do not appear in the account. |
| Route 53 hosted zones and registered domains | **none** |
| Resource Groups Tagging API (us-east-2, us-east-1) | only the KMS key and a payment instrument; nothing else is tagged |
| Cost Explorer (`ce get-cost-and-usage`) | **AccessDenied: "User not enabled for cost explorer access"**. Cost Explorer is not enabled, or this role may not use it. No budgets exist (`budgets describe-budgets`). The account plan is `PAID` with USD 0 credits remaining (`freetier get-account-plan-state`). |

### L3. Frontend hosting and what the URL serves
- **Verified** (`amplify list-apps`): app `Sandbox` (`d2pllj7b1wqfae`), platform `WEB` (static hosting, no server-side compute, no compute or service role),
  repository `github.com/sustainabilityfoundation-del/Sandbox`, created 12 October 2026 at 02:18 UTC. It has no environment variables, no basic auth
  and one custom rule: `/<*>` → `/index.html` with status `404-200`.
- **Verified** (`amplify list-branches`): one branch `main`, stage PRODUCTION, **auto-build on**, no basic auth, no environment variables.
- **Verified** (`amplify list-domain-associations`): no custom domain. The URL is `https://main.d2pllj7b1wqfae.amplifyapp.com`.
- **Verified** (`amplify list-jobs`, `get-job`): **121 jobs, all SUCCEED** (BUILD, DEPLOY, VERIFY), job 1 on 12 October through job 121 on commit
  `bcb5e97` (current `main`) on 17 October at 13:20 UTC. That is 531 build minutes, 4.4 minutes per build on average. The console build spec is the
  same as `amplify.yml` (`get-app` build spec, redacted print).
- **Verified (HTTP GET):**

| Path | Response |
| --- | --- |
| `/` | 200 `text/html`, title "GLB Model Viewer" (the standalone viewer) |
| `/workspace/` | 200, title "Engineering Workspace (mockup)", bundle `/workspace/assets/index-DvdXjnuW.js` (the current workspace build) |
| `/workspace` | 301 → `/workspace/` (served by S3 behind CloudFront: `Server: AmazonS3`) |
| `/api/health` | **301 → `/api/health/`, then 404 with the GLB viewer's `index.html` as the body** |
| `/api/platform/v1/me` | 301, then the same 404 HTML |
| `/nonexistent.js` | 404 |

### L4. Backend
**Verified** (L2): no compute of any kind exists in any region: no EC2, ECS, App Runner, Lambda, API Gateway, Beanstalk or Lightsail, and no
Amplify compute role. **No backend runs.** `/api/*` reaches only Amplify's static store (L3).

### L5. PostgreSQL
**Verified** (L2): no RDS instance, Aurora cluster or Lightsail database in any enabled region. **No managed PostgreSQL exists, so nothing
holds platform data in AWS.** Engine, version, size, Multi-AZ, public access, backups and encryption do not apply.

### L6. Schemas and migrations in AWS
**Inferred:** with no database and no backend there are no deployed schemas and no applied migrations. No connection was made (the rules forbid
it, and there is nothing to connect to). No CloudWatch log groups exist that could show migration output. The schema inventory from code (§1.4:
9 schemas, 27 migrations) is what the first deployment will create.

### L7. Deployment configuration, CI and logs
- **Verified:** the only deployment mechanism is Amplify's own GitHub integration (auto-build on push to `main`). No GitHub Actions workflow deploys
  (anonymous GitHub API: one workflow, `.github/workflows/ci.yml`).
- **Verified** (GitHub API): 65 CI runs: 3 success, 34 failure, 28 cancelled. The latest four failed in `npm run check`
  (`CommandSurfaces.browser.test.ts`: "Element is outside of the viewport", runs 62-64) and in "Requirements database tests" (run 65).
  CI and Amplify are independent: **Amplify deployed all 121 commits, including those whose CI failed.**
- **Verified:** no CloudWatch log groups or alarms exist in any region. Amplify build logs are reachable only through presigned URLs, which were not
  fetched because the job steps already show SUCCEED.

### L8. Root cause (revised, with evidence)
The site is not broken by a failed deployment. **The deployment succeeds, but it can only ever contain the static half of the platform.**
1. **No backend and no database exist in AWS** (L2, L4, L5). The workspace calls same-origin `/api/...` (§1.6). On Amplify those requests are
   redirected (301) and then answered with **404 and the GLB viewer's HTML** (L3). The workspace's health check (`response.ok`) therefore reports
   the API as unreachable, and every module that loads data (projects, requirements, System Model, CAD, Conceptualize, settings, assistant) fails.
2. **The root URL serves the GLB viewer, not the platform** (L3: `/` title "GLB Model Viewer"). The workspace is reachable only at `/workspace/`.
3. Secondary: even a backend added now would refuse every request in production mode, because production sign-in is not built (§1.7). That is a
   design gap the repair has to decide on (D3), not a cause of today's symptom.

Ruled out by evidence: failed Amplify builds (121 of 121 succeeded), a missing workspace build (`/workspace/` serves the current bundle), and an
existing database that is unreachable (none exists).

### L9. Corrective actions (revised; smallest repair first, brief §11 phase 2)
1. **Immediate, owner approval, free, reversible:** add an Amplify redirect `/` → `/workspace/` (302) ahead of the existing rule, so visitors reach
   the workspace. The viewer stays reachable at `/index.html`. Optional: turn off auto-build on `main` and build on demand, or from a release branch,
   to stop paying for about 27 builds a day.
2. **Repair (needs approval of billable resources, D3, and the Platform code changes C3, C4, C7 and C5 if D3 = a):** a dev backend in **us-east-2**
   as AWS_ARCHITECTURE.md describes (one Fargate task, RDS PostgreSQL 17, EFS, Secrets Manager), reached at `/api/*` on the same origin. Either:
   - keep Amplify and add one rewrite `/api/<*>` → `https://<api origin>/api/<*>` (status 200, proxy) above the `/<*>` rule. The target must be HTTPS, so the API needs either a domain with an ACM certificate on the load balancer or its own CloudFront distribution. This is the smallest
     frontend change. Its behaviour with SSE event streams must be checked on dev; streams resume after a drop.
   - or serve dev from its own CloudFront distribution (AWS_ARCHITECTURE.md §4.3) and retire Amplify after acceptance.
3. Nothing needs to be migrated, restored or preserved: there is no existing data in AWS (L5).

### L10. Risks to existing data
**Verified:** none in AWS: no database, bucket, file system or secret exists (L2, L5). The only stateful item is the Amplify app with its build
history. The rewrite and redirect changes in L9 are reversible console or CLI edits. **Inferred:** the real platform data, including the D1
project, lives only on the owner's machine (embedded PostgreSQL in `.data/pg` and blobs in `.data/objects`), so it has no off-machine backup. Copying it to
AWS would be a separate, explicit owner decision; it is not part of the deployment.

### L11. Cost (revised)
- **Actual spend: not readable**, because Cost Explorer is not enabled for this account (L2). The owner can enable it under Billing → Cost Explorer,
  or read the Amplify line on the bill.
- **Inferred from verified usage:** the only billable service is Amplify Hosting: 531 build minutes in 5 days, at USD 0.01 per minute (standard
  build instance; the account has no free-tier credits left), is about **USD 5.30 so far**. At the current pace of about 27 builds a day, that is
  **roughly USD 35 a month**, plus negligible storage and transfer. This replaces the USD 120 guess in AWS_COST_ESTIMATE.md §4.

### L12. Deployed versus intended architecture

| Component | Intended (AWS_ARCHITECTURE.md) | Deployed |
| --- | --- | --- |
| Frontend | S3 and CloudFront per environment; `/` → `/workspace/` | Amplify static `WEB` app; `/` is the GLB viewer |
| `/api/*` routing | CloudFront behaviour → ALB → Fargate | none (SPA fallback 404) |
| Backend | ECS Fargate, 1 task | none |
| Database | RDS PostgreSQL 17, private | none |
| Blobs | EFS, later S3 | none |
| Secrets | Secrets Manager (DB, `EWS_ASSISTANT_KEY`) | none |
| Networking | VPC, two AZs, no NAT | default VPC only, unused |
| IAM / CI deploy | GitHub OIDC roles, environments | none; Amplify's GitHub integration only |
| Observability | CloudWatch logs and alarms, budgets | none; no budget, and Cost Explorer is off |
| Account | dev and prod stacks | a single management account; no member account for workloads |

## 0. Access available to the first (repository-only) audit (superseded by the live inventory)

| Source | Result |
| --- | --- |
| AWS CLI | **Verified: not available.** `aws` is not on PATH (Git Bash and PowerShell), `C:\Program Files\Amazon\AWSCLIV2` does not exist, and there is no `%USERPROFILE%\.aws`. **No AWS resource could be inspected.** Every statement about AWS resources is therefore Assumed. |
| GitHub CLI | **Verified: not available** (`gh` not on PATH). |
| GitHub REST API (anonymous, GET only) | **Verified: works.** The repository `sustainabilityfoundation-del/Sandbox` is **public** (`private: false`). Workflow runs, jobs, step results and check annotations are readable. Job logs, webhooks and repository secrets require authentication and were not read (`/hooks` returned 401). |
| Deployed site URL | **Not found.** No Amplify, CloudFront or custom domain URL appears in the repository, the GitHub repository (`homepage` empty, no Pages, no deployments, no environments) or the docs. No HTTP check of a live site was possible. |

## 1. What is implemented (repository)

### 1.1 Hosting definition
- **Verified (file read):** the only AWS definition is `amplify.yml` (added in cd5ffdc, 12 October 2026, "Add SolidWorks GLB viewer web app",
  never changed since). It is an **AWS Amplify Hosting frontend-only build**: `nvm install 22`, `npm ci`, `npm run build`, artifacts `dist/**`.
  There is no `backend:` section, no rewrites/redirects file (`customHttp.yml`, `redirects.json`) and no Amplify Gen 2 `amplify/` folder.
- **Verified:** `npm run build` = `typecheck` (all workspaces) + GLB viewer build into `dist/` (site root) + workspace build into `dist/workspace/` (`base: '/workspace/'`).
  So **the site root is the standalone GLB viewer**, and the engineering workspace is only at `/workspace/`.
- **Verified (search):** no Dockerfile, no Terraform, CDK, CloudFormation, SAM, Serverless, Pulumi, ECS task definition, Lambda handler, or deployment
  script exists in the repository. `apps/glb-viewer/README.md` documents connecting Amplify through the console by hand.
- **Verified:** `docker-compose.yml` defines only a local `postgres:17` for development (bound to 127.0.0.1).

### 1.2 Backend (`services/api`)
- **Verified (code read):** one Fastify 5 process (`services/api/src/main.ts`, run with `tsx`, no compile step) hosts every server module:
  platform identity, requirements, conceptualize, projects, settings, assistant, sysml, cad, visualization (registration order in `server.ts`, module list in `modules.ts`).
- **Verified:** health endpoint `GET /api/health` runs `SELECT 1` and returns `{status, database, latencyMs}`; it is a readiness check (database reachable), there is no separate liveness endpoint.
- **Verified:** structured JSON logging (`logger: true`, Fastify/pino) to stdout; 5xx errors logged with an `errorId`.
- **Verified:** graceful shutdown on SIGTERM/SIGINT (closes server, pool, embedded PostgreSQL). Event streams (SSE) send `: keep-alive` every 15 s (cad, conceptualize, projects).
- **Verified:** no CORS plugin anywhere: the backend expects **same-origin** requests.
- **Verified:** listen address `API_HOST` (default `127.0.0.1`), port `API_PORT` (default 8787). A container must set `API_HOST=0.0.0.0`.

### 1.3 Embedded versus external PostgreSQL (how `services/api` chooses)
- **Verified (`services/api/src/config.ts`):** `EWS_PG` selects the mode; **default `embedded`**. `embedded` starts PostgreSQL binaries from the
  `embedded-postgres` npm package (a devDependency, loaded by dynamic import only in that mode) on `EMBEDDED_PG_PORT` (54329) with data in `.data/pg`.
  `external` connects to `DATABASE_URL`, **falling back to `postgres://ews:local-dev-only@127.0.0.1:5432/<db>`** when it is unset.
- **Verified (`main.ts`):** in both modes the server connects to the `postgres` admin database and runs `CREATE DATABASE` if the target database is missing (`ensureDatabase`).
- **Risk (Verified in code):** nothing stops `NODE_ENV=production` from running in embedded mode. A container started without `EWS_PG=external`
  would silently start a throw-away PostgreSQL inside the container and lose all data on restart. See changes C3.

### 1.4 Schema inventory (from code)
One shared migration framework pattern, **Verified (code read)**: per-schema runner, files `NNNN_name.sql` applied in order, each in its own
transaction, recorded in `<schema>.schema_migrations (version, name, checksum, applied_at)`; a changed applied file fails with
"checksum mismatch"; concurrent runners are serialised with `pg_advisory_lock(hashtext('migrate:<schema>'))`. Requirements, conceptualize and
projects carry their own copy of `migrate()` (platform uses the requirements copy); settings, assistant, sysml, cad and visualization have a small
per-module runner with the same conventions.

| Schema | Owner (AGENTS.md) | Migrations | Count | Applied by | Tracking table |
| --- | --- | --- | --- | --- | --- |
| `platform` | Platform (`services/api`) | `services/api/src/platform/migrations` | 3 | `prepareDatabase` (`db:migrate` and start-up) | `platform.schema_migrations` |
| `requirements` | Requirements | `services/requirements/src/db/migrations` | 3 | `prepareDatabase` | `requirements.schema_migrations` |
| `conceptualize` | Conceptualize | `services/conceptualize/src/db/migrations` | 8 | `prepareDatabase` | `conceptualize.schema_migrations` |
| `projects` | Project Management | `services/projects/src/db/migrations` | 4 | `prepareDatabase` | `projects.schema_migrations` |
| `settings` | AI connection | `services/settings/src/db/migrations` | 1 | settings plugin at start-up only | `settings.schema_migrations` |
| `assistant` | AI connection | `services/assistant/src/db/migrations` | 4 | assistant plugin at start-up only (only when `EWS_ASSISTANT_KEY` is available) | `assistant.schema_migrations` |
| `visualization` | AI connection | `services/visualization/src/db/migrations` | 1 | visualization plugin at start-up only | `visualization.schema_migrations` |
| `sysml` | SysML Modeler | `services/sysml/src/db/migrations` | 1 | sysml plugin at start-up only | `sysml.schema_migrations` |
| `cad` | CAD Modeler | `services/cad/src/db/migrations` | 2 | cad plugin at start-up only | `cad.schema_migrations` |

Total: **9 schemas, 27 migrations**. **Verified (grep):** no `CREATE EXTENSION`, no `DROP TABLE/SCHEMA/COLUMN`, `TRUNCATE` or `DELETE FROM` statements in any
migration (immutable tables are protected by triggers refusing UPDATE/DELETE/TRUNCATE). PostgreSQL 17 locally (embedded-postgres 17.10, `postgres:17`).
**Gap (Verified):** `npm run db:migrate` applies only the first four schemas; the other five are applied only when the server starts. There is no
single "migrate everything, then exit" command, which a deployment pipeline needs (change C4).

Design reasoning (`packages/design-reasoning-core`) has database tests but **no schema of its own** (Verified: no migrations; it uses the
Conceptualize and Requirements APIs).

### 1.5 Storage outside PostgreSQL
- **Verified:** Requirements import/export objects use `localObjectStorage(STORAGE_DIR)`; Project Management documents, attachments and visualization
  images use the content-addressed `localBlobStore(STORAGE_DIR)`; both default to `.data/objects` on the local disk. No S3 adapter exists.
- **Verified:** CAD documents are stored in PostgreSQL (`cad.document_revisions.content`, JSONB), not in a blob store.
- **Verified:** the workspace `FilesService` is `createMemoryFilesService()` (browser memory, staging only, not persisted).
- **Consequence:** on any container platform without a persistent volume, documents, attachments and generated images would be lost on restart.

### 1.6 How the workspace finds its API
- **Verified (`apps/workspace/src/platform/services.ts`, `settings/api.ts`):** every client uses **relative, same-origin paths** (`/api/requirements/v1`,
  `/api/concepts/v1`, `/api/sysml/v1`, `/api/projects/v1`, `/api/cad/v1`, `/api/visualization/v1`, `/api/settings/v1`, `/api/assistant/v1`, `/api/health`).
  In development Vite proxies `/api` to `localhost:8787`. There is **no build-time API base URL** (the only `VITE_` variable is the optional
  `VITE_ASSISTANT_ENDPOINT`). In production, the host serving the workspace must therefore route `/api/*` to the backend.
- **Verified:** default mode is `api`; demo mode is an explicit user choice saved in localStorage, and "an API failure never switches to it".

### 1.7 Identity in deployed environments
- **Verified (`services/api/src/platform/identity.ts`):** development identity is the `X-Dev-User` header naming a seeded user (ada, rui, eli, rho, nia).
  With `NODE_ENV=production` the header is refused **and every request fails with "Production authentication (OIDC bearer token) is not configured
  on this host"**: OIDC is a documented integration point that is not built (architecture.md: identity is "Prototype only", ADR-0008).
- **Verified:** the browser clients can send `Authorization: Bearer` when given a `token()` callback, but the workspace never passes one; it always sends `X-Dev-User`.
- **Consequence:** today the backend cannot serve the workspace in production mode at all, and in non-production mode anyone who reaches it can act
  as any development user. This is the main owner decision for phase 2 (decision D3).

### 1.8 Leakage of demo data, development identities and localhost
| Item | Finding |
| --- | --- |
| Seed data | **Verified:** `SEED_ON_START` defaults to `true` outside production and `false` with `NODE_ENV=production`. Seeding adds the five development users, project PRJ-ACT100, sample requirements/concepts and the legacy product. A deployment running in non-production mode must set `SEED_ON_START=false` explicitly (production dev data risk). |
| Dev identity routes | **Verified:** `GET /api/platform/v1/dev-users` exists only outside production; `X-Dev-User` refused in production. |
| Fake AI provider and fake image adapter | **Verified:** registered only when not production and in mock mode. |
| Localhost URLs in the bundle | **Verified (grep):** none in client code other than documentation comments and a help sentence about Sign in with ChatGPT. Same-origin paths only. |
| Developer AI keys in the bundle | **Verified (grep):** no `import.meta.env.*` key access in any package; keys are read by `services/api` only. |
| Demo services in the bundle | **Verified:** demo requirement/concept services and a demo assistant are bundled but used only on explicit choice (demo assistant until a person connects an AI account; labelled). **Assumed:** the workspace shows a development-user selector even when served in production. |

### 1.9 Secrets
- **Verified:** `.env.example` contains no secrets (local-only values); `.env` is git-ignored. The local default password `local-dev-only` is in code as a fallback (config.ts, docker-compose).
- **Verified (`services/assistant/src/keyfile.ts`):** the credential-encryption key for stored AI connections is `EWS_ASSISTANT_KEY` (32 bytes, base64).
  Outside production, if unset, a key is generated once into `.data/assistant.key`; in production, if unset, **the assistant API is not started**.
  On an ephemeral container without the variable (non-production mode) a new key per container would make every stored connection unreadable after a restart.
- **Verified (`config.ts` `readAiConfig`):** production forces AI mode `user` (people's own connections), ignores `EWS_AI_MODE`, the fake provider and developer
  keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_AI_API_KEY`, `XAI_API_KEY`). Outside production, developer keys are read only
  with `EWS_AI_MODE=development`. Default outside production is `user` too.
- **Verified (`server.ts`):** Sign in with ChatGPT is enabled only when the public origin starts with `http://127.0.0.1:`, so a deployed site offers API-key connections only.
  The public origin is derived from `API_HOST:API_PORT` (no override), which is wrong behind a proxy (minor change C7).
- **Verified:** CI uses no secrets and no AWS credentials (`permissions: contents: read`).

## 2. What is deployed (first audit, assumptions; see the live inventory L2-L5)

| Item | Status |
| --- | --- |
| Amplify app connected to this repository | **Assumed (likely).** Evidence: `amplify.yml` exists for that purpose, README and glb-viewer README describe Amplify Hosting, and the owner reports an "AWS-hosted application". Not verifiable without AWS access. Amplify posts no commit statuses on this repository (**Verified:** combined status of 6219408, bc9aef7 and 74d51b8 is empty), so it is not visible from GitHub. |
| Which branch Amplify builds, its URL, rewrites, password protection | **Unknown.** Requires `aws amplify list-apps`, `get-app`, `list-branches`, `list-jobs` (owner action O2). |
| Backend (any compute) | **Assumed: none.** No definition, image or script exists for any backend host; nothing in the repository or GitHub deploys one. |
| RDS or other managed PostgreSQL | **Assumed: none.** Nothing references RDS, Aurora, Lightsail databases or a remote `DATABASE_URL`. Must be checked with `aws rds describe-db-instances` and `describe-db-clusters` in every region used, plus `lightsail get-relational-databases`, before creating anything (brief §2). |
| S3, CloudFront, ECR, ECS, Lambda, Secrets Manager | **Assumed: none created by this repository.** Amplify Hosting uses AWS-managed S3/CloudFront that do not appear in the account. |
| GitHub deployment pipeline | **Verified: none.** One workflow (`.github/workflows/ci.yml`, "CI"), no deployments, no environments, no OIDC. |

## 3. What is functional

- **Verified (GitHub API):** CI has run 61 times (all on pushes to `main`, one pull request); **3 succeeded** (runs 12, 13, 31; last success run 31 on 74d51b8, 16 October 21:38 UTC).
  The remainder failed or were cancelled by the concurrency group (frequent pushes). Recent failures are in two places:
  - step "Requirements database tests" (in every sampled earlier failure: runs 2, 14, 24, 36, 40, 52 and 56; run id 39026903028 is run 56). The failing test is not visible without authenticated log access.
    The coordinator records the same suite failing under load locally ("one load-related rerun", Windows EPERM); on CI the cause is **unknown**.
  - step `npm run check`, browser test `packages/design-system/src/components/CommandSurfaces.browser.test.ts` ("Element is outside of the viewport" and a 15 s
    `waitFor` timeout; runs 54, 55 and 57). Runs not listed here were not sampled.
  These are test-stability failures, not build failures: in every run that reached "Requirements database tests", the earlier `npm run build` step succeeded
  (**Verified** from step conclusions), so **the exact Amplify build command succeeds on Ubuntu with Node 24** for those revisions.
- **Assumed:** the Amplify build also succeeds (Node 22 via nvm; `engines.node >=20.19`). Amplify builds do not depend on CI, so red CI does not block an Amplify deployment.
- **Verified (code):** locally the full stack works (`npm run dev`); D1 ran live on the real services (coordinator status), so the application itself is functional.
- **Annotations (Verified):** actions/checkout@v4, setup-node@v4 and upload-artifact@v4 run on deprecated Node 20 runtimes (forced to 24); `ubuntu-latest`
  moves to Ubuntu 26 from 19 October 2026. Neither breaks CI today.

## 4. What is broken: most likely causes (first audit; revised in L8)

Ranked by likelihood. Without AWS access none can be proven; the evidence is from code and configuration.

1. **No backend in AWS (very likely; cause of most symptoms).** Amplify Hosting serves `dist/` only. The workspace calls same-origin `/api/...` (§1.6), which no
   AWS resource serves. Every module (projects, requirements, System Model, CAD, Conceptualize, settings, assistant) therefore fails to load data.
   Evidence: `amplify.yml` has no backend; no backend host is defined anywhere; client paths are relative.
2. **`/api/*` answered by the SPA fallback (likely, aggravates 1).** Amplify apps commonly carry the console's default rewrite `/<*> → /index.html` (200 or 404-200).
   Then `/api/health` returns the GLB viewer's `index.html` (`response.ok` true), the header can show the backend as reachable, and every JSON parse fails with
   confusing errors. Evidence: `checkApiHealth()` only tests `response.ok`. Needs `aws amplify get-app` (customRules) to confirm.
3. **The root URL shows the GLB viewer, not the platform (certain if Amplify serves `main`).** `dist/index.html` is the standalone viewer; the workspace is at
   `/workspace/`. A visitor at the root sees only the viewer (brief §4: "not only the GLB viewer"). Direct loads of `/workspace` without the trailing slash may
   also hit the fallback rewrite and get the viewer (Assumed).
4. **Even with a backend, production mode refuses every request** (§1.7, Verified in code): `NODE_ENV=production` has no authentication implemented.
   Running it in development mode needs `SEED_ON_START=false`, `EWS_PG=external`, `EWS_ASSISTANT_KEY` and an access gate.
5. **Build failure on Amplify (possible, lower likelihood).** Would be visible in `aws amplify list-jobs`. If so, the cause would differ from CI (Node 22 vs 24,
   build image memory during `typecheck` of all workspaces). Not verifiable now.

## 5. What is missing

- Backend hosting, container image (no Dockerfile), image registry, backend deploy pipeline.
- Managed PostgreSQL, its networking, backups, credentials in Secrets Manager.
- A single migrate-all command and a migration step in deployment.
- Persistent storage for `STORAGE_DIR` objects (S3 adapter or a persistent volume).
- `/api/*` routing at the edge (Amplify rewrite or CloudFront behaviour) and HTTPS for the API.
- Production authentication (OIDC), or an approved access gate for a development-mode prototype.
- Infrastructure as code; GitHub OIDC role; dev and prod environments with production approval; CloudWatch logs and alarms; deployment smoke tests.
- Runbook, backup/restore procedure.

## 6. Changes required

Smallest safe repair first (brief §11, phase 2). Each item says who owns it.

**Smallest repair that makes the platform work in AWS.** No frontend-only fix can make it work: the workspace needs `services/api` and
PostgreSQL. The smallest safe repair is therefore: C1 (know what exists), then one backend task with a managed database and persistent
`STORAGE_DIR` (C2-C4, C6, C9 for dev only), reached at `/api/*` on the same origin as the workspace (C8), with an approved identity mode (C5).
The existing Amplify app is left untouched until that works; then either one Amplify rewrite (`/api/<*>` proxied to the new API origin, and `/`
redirected to `/workspace/`) or retiring Amplify in favour of the environment's CloudFront distribution (owner decision D4). Interim option
(not a repair): telling users to choose demo mode in the workspace settings shows only Requirements and Conceptualize demo data; System Model,
CAD and Projects still need the API.

| # | Change | Type | Owner / approval |
| --- | --- | --- | --- |
| C1 | Read-only inspection of the account (§7 commands of the runbook): Amplify app, branch, rewrites, last jobs; RDS/Aurora/Lightsail databases; ECS/EC2/Lambda; region. | inspection | owner provides read-only access (O1) |
| C2 | Container image for `services/api` (Dockerfile, Node 24, `npm ci`, `tsx`, non-root, `API_HOST=0.0.0.0`), built in CI. | repo, non-destructive | aws-infrastructure; coordinator review (Platform owns `services/api`) |
| C3 | Fail fast when deployed without a real database: refuse `EWS_PG=embedded` (and the `local-dev-only` fallback URL) when `EWS_DEPLOYED=1` or `NODE_ENV=production`. | small platform code change | Platform (coordinator) |
| C4 | `migrate` entry point applying all nine schemas with the existing runners (prepareDatabase plus the five module `migrateX` functions), exiting non-zero on failure; also a read-only `status` listing applied versions per schema. | small platform code change | Platform; each module keeps its migrations |
| C5 | Identity for the deployed prototype: either (a) development identities behind an edge access gate with an explicit `EWS_AUTH=dev` switch decoupled from `NODE_ENV`, or (b) OIDC bearer tokens (e.g. Amazon Cognito) in `authenticate` and a `token()` in the workspace clients. | platform change | **owner decision D3**, Platform |
| C6 | Persistent `STORAGE_DIR`: EFS volume (no code change) now; S3 adapters for `BlobStore` and `ObjectStorage` later. | infra; later module code | owner decision D5; Projects and Requirements owners for S3 adapters |
| C7 | `EWS_PUBLIC_ORIGIN` override for the assistant's public origin behind a proxy. | small platform code change | Platform |
| C8 | Edge routing: `/api/*` to the backend, `/workspace/*` to the workspace with index fallback, root redirect to `/workspace/` (or keep the GLB viewer at root by owner choice). | infra | owner decision D4 |
| C9 | RDS PostgreSQL 17 (dev, prod), Secrets Manager, VPC, IAM, CloudWatch, GitHub OIDC, deploy workflows, smoke tests. | infra, billable | owner approval (§12) after cost review |
| C10 | CI stability (Requirements DB suite on CI, CommandSurfaces browser test) so a green CI can gate deployment; update actions to Node 24 majors before forced removal. | repo | module owners / coordinator |

No change in this list deletes or rewrites data. The only data at risk today is whatever an existing deployment holds, which this audit could not see (see AWS_ARCHITECTURE.md §10).
