# Skill Registry - sistema-midoc

## Project Conventions
- **Index**: [CLAUDE.md](file:///c:/Sistema%20MiDoc/sistema-midoc/CLAUDE.md)
- **Docs**: [SISTEMA_ACTUAL.md](file:///c:/Sistema%20MiDoc/sistema-midoc/consultorio-app/docs/SISTEMA_ACTUAL.md)

## Active Skills
| Skill | Trigger | Source |
|-------|---------|--------|
| sdd-init | sdd init, iniciar sdd | Global |
| sdd-explore | sdd-explore | Global |
| sdd-propose | sdd-propose | Global |
| sdd-spec | sdd-spec | Global |
| sdd-design | sdd-design | Global |
| sdd-tasks | sdd-tasks | Global |
| sdd-apply | sdd-apply | Global |
| sdd-verify | sdd-verify | Global |
| sdd-archive | sdd-archive | Global |
| judgment-day | judgment day, juzgar | Global |

## Compact Rules
### General
- Use conventional commits.
- Never add AI attribution.
- CAPS for emphasis (CARE).
- CONCEPTS > CODE.

### Next.js 16
- Breaking changes from prior versions.
- Check `node_modules/next/dist/docs/` if unsure.
- Use `output: 'standalone'` for Azure.

### Azure Deployment
- Multi-stage Dockerfile for Next.js.
- Single-stage for whatsapp-bot with Chromium dependencies.
- Use `scripts/start.sh` for runtime migrations.
