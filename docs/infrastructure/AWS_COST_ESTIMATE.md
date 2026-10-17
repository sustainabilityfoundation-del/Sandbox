# AWS cost estimate (prototype)

Status: estimate for approval, 17 October 2026, aws-infrastructure agent. **Assumed:** us-east-1 on-demand list prices as known to the agent,
730 hours a month, light prototype traffic, no free-tier credits, USD before tax. Other regions are typically 5-15% higher. Verify with the AWS
Pricing Calculator for the chosen region before approving (brief §8: estimate before provisioning). Architecture: [AWS_ARCHITECTURE.md](AWS_ARCHITECTURE.md).

## 1. Recommended architecture, per environment

| Item | Basis | dev | prod |
| --- | --- | --- | --- |
| ECS Fargate, ARM64, 1 task, 0.5 vCPU / 1 GB | 0.5 × 0.03238 + 1 × 0.00356 per hour | 14.40 | 14.40 |
| Public IPv4 for the task (egress without NAT) | 0.005 per hour | 3.65 | 3.65 |
| Application Load Balancer (internal, through a CloudFront VPC origin) | 0.0225 per hour + about 1 LCU-hour partial | 18.40 | 18.40 |
| RDS PostgreSQL 17, single-AZ | db.t4g.micro 0.016 / db.t4g.small 0.032 per hour | 11.68 | 23.36 |
| RDS storage gp3 20 GB | 0.115 per GB-month | 2.30 | 2.30 |
| RDS backups and pre-deploy snapshots | within the free allowance equal to storage; prod snapshots a little more | 0.00 | 1.00 |
| EFS (`STORAGE_DIR`), about 1 GB, plus AWS Backup | 0.30 per GB-month | 0.30 | 0.60 |
| Secrets Manager, 2-3 secrets | 0.40 per secret-month | 1.20 | 1.20 |
| CloudWatch Logs (about 1 GB a month) and 5-8 alarms | 0.50 per GB ingested, 0.03 storage, 0.10 per alarm | 1.10 | 2.00 |
| ECR, about 2 GB with a lifecycle rule (shared) | 0.10 per GB-month | 0.20 | 0.00 |
| S3 (static site) and CloudFront | within CloudFront's always-free 1 TB and 10 M requests | 0.10 | 0.50 |
| Route 53 hosted zone (only with a custom domain) | 0.50 per zone | 0.00 | 0.50 |
| **Total, always on** | | **≈ 53** | **≈ 68** |

Both environments: **about USD 121 a month**. GitHub Actions minutes cost nothing (public repository). CDK bootstrap adds a few cents (S3 assets).

## 2. Ways to reduce it

| Measure | Saving | Trade-off |
| --- | --- | --- |
| Stop dev outside 07:00-20:00 on weekdays (ECS desired count 0, RDS stopped; a scheduled EventBridge rule) | about 18 a month | Dev unavailable at night; RDS stop lasts at most 7 days, the schedule restarts it |
| One ALB shared by dev and prod (host or path rules) | about 18 a month | Less isolation between environments; a listener change affects both |
| Aurora Serverless v2 with auto-pause instead of RDS for dev | compute near 0 when idle | about 15 s resume after a pause; higher cost when busy (0.12 per ACU-hour) |
| Lightsail container (micro, 10) and Lightsail database (15) instead of Fargate, ALB and RDS | about 25-30 per environment | Weaker networking, IAM, IaC and rollback; harder path to scale (AWS_ARCHITECTURE.md §4.1) |
| Prod only after dev is verified (increment D) | 68 until then | none: recommended order |

With the dev schedule and a shared ALB: **about USD 85 a month** for both environments.

## 3. Optional additions (not in the totals)

Multi-AZ RDS for prod (+ about 26), AWS WAF on CloudFront (about 5 + 1 per rule + 0.60 per million requests), Container Insights (about 3-5),
second Fargate task for zero-downtime under load (+ 14.40), VPC interface endpoints instead of public egress (about 7.30 each per AZ).

## 4. The existing Amplify app

**Assumed:** Amplify Hosting charges build minutes (0.01 per minute after the first year's free tier), storage and data served. `main` received
about 60 pushes in the last 25 hours (61 CI runs, Verified). If Amplify auto-builds every push and a build takes about 7 minutes (`npm ci`, type
check of all workspaces, two Vite builds; not measured), that is about 4 a day, **roughly 120 a month** for builds alone. The real figure is in the
AWS bill (Amplify line) and `aws amplify list-jobs`. Stopping auto-build on `main` or retiring the app (decision D4) may save more than the
whole proposed dev environment costs.

## 5. Cost controls

AWS Budgets alert at 80% and 100% of the approved monthly amount (budgets are free for the first two), cost allocation tags
`project=ews`, `env=dev|prod` on every resource, ECR lifecycle (keep the last 20 images), log retention 30/90 days.
