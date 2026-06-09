# Proposal: Azure Deployment

## Intent
Adapt the monorepo for deployment to Azure App Service (Linux) using Docker. This addresses the need for a scalable, production-ready environment for both `consultorio-app` and `whatsapp-bot`.

## Scope

### In Scope
- Dockerfile for `consultorio-app` (multi-stage, standalone output).
- Dockerfile for `whatsapp-bot` (single-stage, Chromium dependencies).
- `.dockerignore` files for both services.
- `docker-compose.yml` for local testing.
- `scripts/start.sh` for `consultorio-app` to handle database migrations at runtime.
- Update `next.config.ts` for standalone output.

### Out of Scope
- Infrastructure-as-Code (Terraform/Bicep).
- CI/CD pipeline configuration (GitHub Actions).
- Azure resource provisioning (manual via portal as per instructions).

## Capabilities

### New Capabilities
- `deployment-infrastructure`: Configuration for containerization and deployment.

### Modified Capabilities
- None.

## Approach
Implement containerization following the instructions in `consultorio-app/docs/ops/azure-agent-instructions.md`. Use Next.js 16's `standalone` output mode to optimize image size. Use a startup script to ensure Prisma migrations are applied before the server starts.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `consultorio-app/Dockerfile` | New | Container definition for Next.js app. |
| `whatsapp-bot/Dockerfile` | New | Container definition for Express bot. |
| `consultorio-app/.dockerignore` | New | Ignore rules for Next.js app. |
| `whatsapp-bot/.dockerignore` | New | Ignore rules for Express bot. |
| `docker-compose.yml` | New | Local testing orchestration. |
| `consultorio-app/scripts/start.sh` | New | Runtime migration and startup script. |
| `consultorio-app/next.config.ts` | Modified | Enabled standalone output. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Database connectivity in Docker | Med | Use `docker-compose` to verify networking. |
| whatsapp-web.js dependencies | High | Ensure all Chromium deps are in Dockerfile. |
| Standalone mode issues | Low | Verify server starts correctly in local container. |

## Rollback Plan
Revert changes to `next.config.ts` and delete created files.

## Dependencies
- `consultorio-app/docs/ops/azure-agent-instructions.md` (Source of truth).

## Success Criteria
- [ ] Both services build successfully as Docker images.
- [ ] `docker-compose up` starts both services and the database.
- [ ] `consultorio-app` runs migrations on startup.
- [ ] `whatsapp-bot` can launch Chromium in the container.
