# AWS deployment and database infrastructure: owner brief (17 October 2026)

Owner brief, recorded verbatim. The pasted text ended mid-sentence in §8 ("Avoid unnecessary"); anything after that point was not
received.

---

## Mission

Act as the lead engineering coordinator. Spawn a dedicated **AWS Infrastructure & DevOps Agent** to investigate, repair, and complete the AWS deployment architecture for the engineering platform.

The AWS-hosted application is not currently working correctly. There is also uncertainty about whether the PostgreSQL databases are provisioned, migrated, connected, and persistent.

**Your objective is to establish a fully functional, repeatable, secure AWS deployment of the complete engineering platform, including its frontend, backend services, databases, and persistent engineering artifacts.**

Do not disrupt the ongoing work of the other development agents.

## 1. Investigate the existing implementation first

Before making changes, inspect:

- `AGENTS.md` and the architecture documentation.
- All GitHub Actions workflows.
- Existing AWS deployment scripts, configuration, and infrastructure definitions.
- Frontend build and hosting configuration.
- Backend services and API routing.
- PostgreSQL configuration and database initialization.
- Database migrations and seeding.
- Environment variables and secrets management.
- Existing AWS resources, where authorized access is available.

Determine whether the AWS deployment currently uses Amplify, S3, CloudFront, EC2, ECS, Lambda, or another architecture.

Do not assume the existing AWS implementation is correct or that resources are missing merely because they are not defined in the repository.

Use read-only AWS inspection initially. Do not modify, replace, or delete existing AWS resources until their purpose and ownership are understood.

Produce an initial deployment audit identifying:

1. What is implemented.
2. What is deployed.
3. What is functional.
4. What is broken.
5. What is missing.
6. What changes are required.

Distinguish verified observations from assumptions.

## 2. Database architecture

The repository already implements PostgreSQL using embedded PostgreSQL for local development and Docker Compose as an alternative.

Preserve these development workflows.

The platform uses multiple PostgreSQL schemas associated with its modules, including:

- Platform and Project Management
- Requirements Management
- SysML Modeler
- CAD
- Conceptualize
- AI services, settings, and visualization

Inspect the actual code to establish the complete current schema inventory.

For AWS, implement a persistent PostgreSQL deployment using Amazon RDS, unless the existing architecture offers a demonstrably better solution.

Requirements:

- Database provisioned through infrastructure as code.
- Separate development and production environments.
- Automated schema migrations during deployment.
- Persistent data across application releases.
- No destructive schema resets during deployment.
- Database credentials managed through AWS Secrets Manager.
- Private networking and restricted database access.
- Automated backups and documented recovery procedures.
- Migration failure detection and rollback/recovery strategy.
- Database connectivity and readiness checks.
- No development seed data in production.
- Migration version tracking and compatibility checks.

Use the existing migration framework rather than introducing a second competing mechanism.

Do not automatically create a new RDS instance if a suitable managed database already exists.

## 3. Backend deployment

Inspect `services/api` and all registered backend modules.

Ensure the deployed backend supports every currently implemented server module and its associated API.

Evaluate AWS ECS Fargate as the preferred hosting approach, but compare it against the existing deployment before choosing.

Implement:

- Reproducible container builds.
- AWS ECR image storage where appropriate.
- Automatic deployment from GitHub.
- Health and readiness endpoints.
- Structured application logging.
- CloudWatch integration.
- Secure environment configuration.
- Backend-to-database connectivity.
- Graceful startup and shutdown.
- Failure reporting and deployment rollback.

Ensure the production server does not accidentally start embedded PostgreSQL or use local development credentials.

Verify that all implemented APIs are accessible from the deployed frontend.

## 4. Frontend deployment

Inspect the existing React/Vite frontend deployment.

Evaluate retaining existing hosting versus using S3 and CloudFront.

Ensure:

- The complete workspace is deployed, not only the GLB viewer or a standalone module.
- All implemented modules are included.
- Frontend routes work when loaded directly.
- API requests reach the deployed backend.
- CORS and HTTPS are configured correctly.
- Environment-specific API endpoints are configured at build time or through a documented runtime mechanism.
- Browser refreshes do not produce routing errors.
- No backend secrets are included in the frontend bundle.

Check that the production frontend is not inadvertently connecting to localhost or using demo-only data.

## 5. Infrastructure as code

Establish a reproducible infrastructure definition using Terraform or AWS CDK.

Prefer an established open-source approach and follow the repository's open-source evaluation requirements.

The infrastructure should cover, where applicable:

- Frontend hosting and CDN.
- Backend compute and container registry.
- PostgreSQL database.
- Networking and security groups.
- Secrets management.
- IAM roles and permissions.
- Logging and monitoring.
- Persistent artifact storage in S3.
- Deployment environment configuration.

The infrastructure must support clean installation in a new AWS environment without requiring manual recreation of resources.

**Do not automatically apply destructive infrastructure changes.** Generate and review the infrastructure plan first.

## 6. GitHub CI/CD

Inspect and extend the existing GitHub Actions implementation.

Implement a deployment pipeline that:

1. Checks out the selected revision.
2. Installs dependencies.
3. Runs type checking and automated tests.
4. Builds the frontend and backend.
5. Builds and publishes required container images.
6. Validates the infrastructure configuration.
7. Deploys approved infrastructure changes.
8. Applies database migrations safely.
9. Deploys backend services.
10. Deploys frontend assets.
11. Performs end-to-end smoke tests.
12. Reports deployment success or failure.

Use GitHub OIDC authentication to AWS rather than long-lived AWS access keys.

Preserve the existing CI tests and quality gates.

Development deployment should be straightforward, while production deployment must require explicit approval.

## 7. End-to-end verification

Do not consider the task complete merely because GitHub Actions reports a successful deployment.

Demonstrate the following against the actual deployed environment:

- Frontend loads correctly.
- Backend health endpoint responds.
- Database connection succeeds.
- Required schemas and migrations exist.
- A new engineering project can be created.
- The project persists in PostgreSQL.
- A requirement can be created and retrieved.
- A SysML artifact can be persisted and retrieved.
- A CAD artifact can be persisted and retrieved.
- Cross-module references survive application restart.
- Restarting or redeploying the backend does not lose data.
- The frontend correctly displays the persisted engineering data.

Only test capabilities that are genuinely implemented. Report incomplete functionality rather than simulating success.

Use a dedicated test project and avoid modifying existing user data.

If live AWS access is unavailable, clearly distinguish local verification from deployment verification and provide the exact remaining checks.

## 8. Architecture principles

Follow these requirements:

- Preserve the modular architecture.
- Maintain independent module ownership.
- Do not tightly couple modules through shared implementation details.
- Maintain PostgreSQL schema ownership boundaries.
- Use existing platform SDK contracts.
- Prefer mature open-source infrastructure tooling.
- Keep infrastructure costs reasonable during prototype development.
- Avoid unnecessary

*(text ends here)*
