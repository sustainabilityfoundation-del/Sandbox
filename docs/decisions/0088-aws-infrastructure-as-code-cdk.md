# ADR-0088: AWS infrastructure as code: build, integrate or extend

Status: Proposed (17 October 2026, aws-infrastructure agent, phase 2; for coordinator acceptance)
Module: Platform (deployment infrastructure; no module code changes)

## Capability and requirements

The platform needs a repeatable way to create and change its AWS environment: a VPC without NAT, PostgreSQL 17 (RDS), an EFS object
store, Secrets Manager secrets, an ECS Fargate service with a one-off migration task, CloudFront with a password gate, and a GitHub
OIDC deploy role ([AWS_ARCHITECTURE.md](../infrastructure/AWS_ARCHITECTURE.md), [aws-deployment-brief](../specifications/aws-deployment-brief.md)).
Requirements: reviewable plan before any change (the owner approves the exact resources first), no long-lived keys, no account ID in
code (the workloads move to a new member account), guards against replacing stateful resources, and unit tests that run offline.
It serves the owner's decisions of 17 October 2026 (dev backend on CDK, shared password gate, new member account).

## Candidates considered

Licences read from the package registry on 17 October 2026 (npm `license` field); registry text is treated as untrusted data.

| Candidate | Upstream (URL) | Version checked | Licence (verified, with source) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| AWS CDK v2 (`aws-cdk-lib`, `aws-cdk`, `constructs`) | github.com/aws/aws-cdk | 2.273.0, 2.1145.0, 10.8.1 | Apache-2.0 (npm `license`) | Very mature, weekly releases, AWS-maintained | TypeScript like the repository; state held by CloudFormation (no state bucket); change sets are a reviewable plan; automatic rollback; L2 constructs for ECS, RDS, CloudFront (KeyValueStore, VPC origins). `cdk synth` and the assertions module run offline. AWS only. |
| OpenTofu | github.com/opentofu/opentofu | not installed (not an npm package) | MPL-2.0 (upstream LICENSE, as known) | Mature Linux Foundation fork of Terraform 1.5 | HCL, a second language; state bucket and lock to secure; strong runner-up if multi-cloud matters. |
| Terraform (HashiCorp) | github.com/hashicorp/terraform | not installed | BUSL-1.1 since 1.6 (not open source) | Most widely used | Commercial-category licence; no advantage over OpenTofu here. Not chosen. |
| Pulumi | github.com/pulumi/pulumi | `@pulumi/pulumi` 3.270.0 | Apache-2.0 (npm `license`) | Active, company-backed | TypeScript; state in Pulumi Cloud (commercial) or a self-managed bucket; smaller AWS-only community than CDK. |
| SST | github.com/sst/sst | `sst` 4.17.2 | MIT (npm `license`) | Fast-moving | Opinionated app framework over Pulumi; less control over RDS and ECS operations. |
| AWS SAM / plain CloudFormation | github.com/aws/aws-sam-cli | not installed | Apache-2.0 | Mature | Verbose YAML, no abstraction gain for ECS/RDS/CloudFront. |
| Internal scripts (AWS CLI) | this repository | n/a | n/a | n/a | Not reproducible or reviewable as a plan. Rejected. |

## Licence assessment

CDK, constructs and the CLI are Apache-2.0 (preferred category). They are build-time tooling in `infra/aws`: never bundled in the
browser build, never installed in the API image, never distributed. `aws-cdk-lib` bundles Apache-2.0/MIT/ISC dependencies (listed in
its package metadata). No owner approval is required. The 12 `lightningcss*` MPL-2.0 packages that appear in the infra lock file are
optional native builds of a Vite 7 dependency of the test runner, the same dev-only pending review as in the root register.

## Integration design

- **Standalone npm project** `infra/aws` with its own lock file, not a root workspace. A workspace would add roughly 115 packages and
  about 280 MB to every root `npm ci`, including each Amplify build (about 27 a day, billed by the minute) and CI, for code the
  application never runs. Root scripts (`npm run infra:install|typecheck|test|synth`, `deps:register:infra`, `deps:check:infra`) wrap it,
  and its dependencies are registered in [register-infra-aws.json](../dependencies/register-infra-aws.json).
- **Stacks:** `Ews-GithubOidc` (account level), `Ews-Dev-Data` (VPC, ECR, RDS, EFS, secrets, cluster, logs; termination protection;
  stateful resources retained or snapshotted), `Ews-Dev-Migrate` (migration task definition, deployed before the service so the new
  schema is applied first), `Ews-Dev-App` (ALB, service), `Ews-Dev-Edge` (S3, CloudFront, password gate).
- **No account in code:** account and region come from `-c account`, `-c region` or the CLI profile; an optional
  `-c managementAccountId` refuses to deploy into the organization management account. Tests assert no 12-digit number in the source
  or the templates.
- **Gate:** a CloudFront Function with the credential hash in a Key Value Store, set out of band (runbook); fails closed.
- **Tests at the boundary:** CDK `assertions` on the synthesized templates (no public RDS, encryption, deletion protection, no NAT, no
  secret values, OIDC trust limited to one repository and branch) and the gate function's logic with a fake store.
- cdk-nag (Apache-2.0, 3.0.2) was considered as a policy checker and not added now: the assertions cover the owner's listed
  properties, and each added dependency has a cost. Revisit before production.

## Decision

Integrate AWS CDK v2 in TypeScript as `infra/aws`. No candidate is developed internally; the code is configuration of upstream
constructs. Terraform is excluded by licence; OpenTofu remains the documented alternative if the platform ever leaves AWS.

## Contribution opportunities

None planned. Nothing is published or submitted upstream without explicit owner authorization (strategy section 7).

## Consequences

- Dependencies added: `aws-cdk-lib`, `constructs`, `aws-cdk` (and dev tools already used in the repository), recorded in
  [docs/dependencies.md](../dependencies.md) and the infra register. No effect on D1 or on the application code.
- Nothing is created in AWS by merging this change: deployment is a separate, owner-approved step ([runbook](../infrastructure/DEPLOYMENT_RUNBOOK.md)).
- The CloudFront-default certificate fixes the viewer TLS policy at TLS 1.0 and above for the `*.cloudfront.net` name; a custom domain
  with an ACM certificate (open owner decision) allows TLS 1.2 as the minimum.
- Production stacks are not defined; they need their own review (separate database role, Multi-AZ decision, approval environment).
