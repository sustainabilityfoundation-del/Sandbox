# AWS cost estimate (dev stack)

Status: estimate for approval, updated 17 October 2026 (phase 2, aws-infrastructure agent). Supersedes the phase 1 figures for dev.
Architecture: [AWS_ARCHITECTURE.md](AWS_ARCHITECTURE.md). Exact resources: [DEV_STACK_RESOURCES.md](DEV_STACK_RESOURCES.md).

**Method and date checked: 17 October 2026.** Unit prices are **Verified**: read on that date from the AWS Price List API
(`aws pricing get-products`, a read-only call through the `engineering-dev` profile) for region **us-east-2**, on-demand, USD. Usage is
**Assumed**: 730 hours a month, one task, light prototype traffic (about 1 GB of logs, 1 GB on EFS, under 2 GB of images, ALB at about
0.3 capacity units), no free-tier credits (the account plan has none left, audit L2), tax excluded. Re-check with the AWS Pricing
Calculator and enable Cost Explorer before approving. Prices change; the source column names the Price List usage type.

## 1. Dev stack, per resource (always on)

| Resource | Basis | Unit price (source usage type) | Monthly USD |
| --- | --- | --- | --- |
| ECS Fargate task, ARM64, 0.5 vCPU, 1 GB | 730 h × (0.5 × 0.03238 + 1 × 0.00356) | 0.03238 per vCPU-h; 0.00356 per GB-h (`USE2-Fargate-ARM-vCPU-Hours:perCPU`, `USE2-Fargate-ARM-GB-Hours`) | 14.42 |
| Public IPv4 of the task (outbound without NAT) | 730 h × 0.005 | 0.005 per h (`USE2-PublicIPv4:InUseAddress`) | 3.65 |
| Application Load Balancer, internal | 730 h × 0.0225, plus about 0.3 LCU × 730 h × 0.008 | 0.0225 per h; 0.008 per LCU-h (`USE2-LoadBalancerUsage`, `USE2-LCUUsage`) | 18.18 |
| RDS PostgreSQL 17, db.t4g.micro, single-AZ | 730 h × 0.016 | 0.016 per h (`USE2-InstanceUsage:db.t4g.micro`, PostgreSQL) | 11.68 |
| RDS storage, gp3, 20 GB | 20 × 0.115 | 0.115 per GB-month (`USE2-RDS:GP3-Storage`) | 2.30 |
| RDS backups (7 days) | within the free allowance equal to provisioned storage | 0.095 per GB-month above it (`USE2-RDS:ChargedBackupUsage`) | 0.00 |
| EFS, standard, about 1 GB, elastic throughput | 1 × 0.30; throughput per GB moved is negligible (**Assumed** 0.03 read, 0.06 write per GB) | 0.30 per GB-month (`USE2-TimedStorage-ByteHrs`) | 0.35 |
| EFS automatic backup (AWS Backup warm storage) | 1 × 0.05 | 0.05 per GB-month (`USE2-WarmStorage-ByteHrs-EFS`) | 0.05 |
| Secrets Manager, 2 secrets (database, assistant key) | 2 × 0.40; API calls negligible | 0.40 per secret-month (`USE2-AWSSecretsManager-Secrets`) | 0.80 |
| CloudWatch Logs, about 1 GB ingested, 30-day retention | 1 × 0.50 + 1 × 0.03 | 0.50 per GB ingested; 0.03 per GB-month stored (`USE2-DataProcessing-Bytes`, `USE2-TimedStorage-ByteHrs`) | 0.53 |
| ECR, about 2 GB (last 20 images) | 2 × 0.10 | 0.10 per GB-month (`USE2-TimedStorage-ByteHrs`) | 0.20 |
| S3 static site, under 1 GB | 1 × 0.023 | 0.023 per GB-month (`USE2-TimedStorage-ByteHrs`) | 0.05 |
| CloudFront (price class 100), Function, Key Value Store, VPC origin | within the always-free allowance (1 TB, 10 M requests; 2 M function executions free, then 0.10 per million). **Assumed:** no separate charge for the VPC origin or KVS reads at this volume; not found in the Price List, confirm in the first bill | | 0.00 |
| VPC, subnets, security groups, S3 gateway endpoint, IAM, CloudFormation, ECS cluster | no charge | | 0.00 |
| **Total, always on** | | | **≈ 52** |

## 2. Reductions and options

| Measure | Effect | Trade-off |
| --- | --- | --- |
| Night schedule (`-c nightSchedule=true`: task stops 20:00, starts 07:00 on weekdays, off at weekends) | Fargate and IPv4 run 65 of 168 hours: 18.07 → 7.0, so **≈ 41 a month** (saves 11) | Dev unavailable at night and at weekends; RDS and the ALB keep running (stopping RDS needs a scheduled job not built here, and AWS restarts a stopped instance after 7 days) |
| Remove the ALB (not possible with a VPC origin; the alternative is a public task address behind the CloudFront prefix list) | saves 18 | Task address changes at every replacement; no stable origin; weaker isolation. Not recommended |
| Aurora Serverless v2 with auto-pause instead of RDS | compute near 0 when idle | About 15 s resume; higher when busy; more resources. Not chosen |
| Container Insights, WAF, Multi-AZ, a second task | each adds cost | Optional, not included: Multi-AZ about +12 for dev, a second task +14.4, WAF about +6 and up |

## 3. Production (not defined)

No production stack exists. The phase 1 estimate (about USD 68 a month: db.t4g.small 23.4, same Fargate, ALB and IPv4, longer backups, alarms,
Route 53 zone) used us-east-1 prices from memory and is **Assumed**; redo it from the Price List when production is designed.

## 4. The existing Amplify app (unchanged by this change)

**Verified (live audit L3, L11):** the Amplify app `d2pllj7b1wqfae` (us-east-2) ran 121 builds between 12 and 17 October 2026, all successful, for
531 build minutes (4.4 minutes each). **Inferred:** at USD 0.01 per build minute that is about USD 5.30 so far and **roughly USD 35 a month** at the
current pace of about 27 builds a day. It keeps running, and keeps costing, until the owner stops auto-build or retires it after the dev stack is
accepted (open decision). The root redirect in this change is part of the same build, so it also reaches Amplify.

## 5. Cost controls to switch on first

1. Enable Cost Explorer in the new member account; the management account's Cost Explorer shows the member account too.
2. AWS Budgets: a monthly budget of USD 60 for the account with alerts at 80% and 100% (the first two budgets are free).
3. Tags `project=ews`, `env=dev` are applied to every resource by the stacks (cost allocation tags must be activated once in Billing).
4. Log retention 30 days and ECR keeping 20 images are in the stack.
