# API Product Separation

The API is now exposed with product-specific namespaces while keeping backward compatibility with legacy routes.

## Agenda product

- Base path: `/api/agenda/*`
- Includes scheduling and booking capabilities.

Examples:

- `/api/agenda/admin/appointments`
- `/api/agenda/admin/availability`
- `/api/agenda/admin/agenda/day`
- `/api/agenda/public/appointments`
- `/api/agenda/public/availability`

## Clinical records product

- Base path: `/api/clinical/*`
- Includes patient records, questionnaires, clinical notes, and AI note support.

Examples:

- `/api/clinical/admin/patients`
- `/api/clinical/admin/questionnaires`
- `/api/clinical/admin/appointments/[id]/note`
- `/api/clinical/public/questionnaire/[token]`

## Plan enforcement

- Access is validated at `src/proxy.ts`.
- `/api/agenda/*` requires `AGENDA` module.
- `/api/clinical/*` requires `CLINICAL_RECORDS` module.
- `COMBINED` plans can access both.

## Compatibility strategy

- Legacy routes under `/api/admin/*` and `/api/public/*` remain available for current clients.
- New namespaced routes re-export existing handlers to avoid behavior changes during migration.
