# Landing Paciente Con Busqueda De Medico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical homepage with a patient-first landing page that lets patients search public doctors by name, city, or specialty and continue to `/perfil/[slug]` to book.

**Architecture:** Add a focused public doctor search domain service, expose it through `GET /api/public/doctors`, and render `/buscar` as a Server Component that calls the service directly. Keep `/` lightweight: it presents the landing copy and redirects the search form to `/buscar?q=...`.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript strict mode, Prisma, Zod, Vitest, existing global CSS tokens.

---

## Scope Check

This plan covers one cohesive slice: patient landing plus public doctor search. It does not change booking internals, patient portal authentication, subscriptions, sync, or clinical data storage.

## File Structure

- Create: `V2/consultorio-app/src/services/doctor/doctor-search-service.ts`
  - Owns public search validation, Prisma query, specialty matching, and public DTO mapping.
- Create: `V2/consultorio-app/src/app/api/public/doctors/route.ts`
  - Public JSON transport for doctor search.
- Create: `V2/consultorio-app/src/app/buscar/page.tsx`
  - Server-rendered search results page, using `searchParams` as a promise per Next.js 16.
- Create: `V2/consultorio-app/src/app/buscar/loading.tsx`
  - Route loading skeleton for search navigation.
- Modify: `V2/consultorio-app/src/app/page.tsx`
  - Replace technical status homepage with patient-first landing and GET form to `/buscar`.
- Modify: `V2/consultorio-app/src/app/globals.css`
  - Add landing/search classes using existing tokens.
- Create: `V2/consultorio-app/tests/integration/doctor-search.integration.test.ts`
  - Tests domain service and public route behavior against the test database.
- Modify: `V2/consultorio-app/tests/smoke/homepage.test.ts`
  - Update smoke expectation from technical copy to patient landing copy.

## Task 1: Public Doctor Search Service

**Files:**
- Create: `V2/consultorio-app/src/services/doctor/doctor-search-service.ts`
- Test: `V2/consultorio-app/tests/integration/doctor-search.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add this file:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";

import { createDoctorAccount, createDoctorSubscription } from "../../src/services/auth/auth-service";
import { createDoctorService, updateDoctorProfile } from "../../src/services/doctor/doctor-profile-service";
import { searchPublicDoctors } from "../../src/services/doctor/doctor-search-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function uniqueSlug(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { doctorProfile: true }
  });

  if (!user) {
    return;
  }

  if (user.doctorProfile) {
    await prisma.doctorSubscription.deleteMany({
      where: { doctorProfileId: user.doctorProfile.id }
    });
  }

  await prisma.user.delete({ where: { id: user.id } });
}

async function createPublicDoctor(input: {
  email: string;
  slug: string;
  professionalName: string;
  specialty: ClinicalProfile;
  city: string;
  state: string;
  serviceName: string;
  isPublic?: boolean;
}) {
  const account = await createDoctorAccount({
    email: input.email,
    password: "Str0ngPass!123",
    firstName: input.professionalName.replace(/^Dr\.?\s*/i, "").split(" ")[0] ?? "Medico",
    lastName: "Busqueda",
    professionalName: input.professionalName,
    specialty: input.specialty,
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });

  await createDoctorSubscription({
    doctorUserId: account.user.id,
    planCode: "ESSENTIAL"
  });

  await updateDoctorProfile(account.user.id, {
    publicSlug: input.slug,
    professionalName: input.professionalName,
    specialty: input.specialty,
    city: input.city,
    state: input.state,
    country: "Mexico",
    phone: "6140000400",
    licenseNumber: "CED-SEARCH",
    isPublic: input.isPublic ?? true
  });

  await createDoctorService(account.user.id, {
    name: input.serviceName,
    priceCents: 90000,
    durationMinutes: 45,
    displayOrder: 1
  });

  return account;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("public doctor search", () => {
  it("finds only public doctors by name and returns the public DTO", async () => {
    const publicEmail = uniqueEmail("doctor-search-public");
    const privateEmail = uniqueEmail("doctor-search-private");
    const publicSlug = uniqueSlug("dra-alma-rivas");
    const privateSlug = uniqueSlug("dra-alma-privada");

    try {
      await createPublicDoctor({
        email: publicEmail,
        slug: publicSlug,
        professionalName: "Dra. Alma Rivas",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        city: "Chihuahua",
        state: "Chihuahua",
        serviceName: "Consulta general"
      });

      await createPublicDoctor({
        email: privateEmail,
        slug: privateSlug,
        professionalName: "Dra. Alma Privada",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        city: "Chihuahua",
        state: "Chihuahua",
        serviceName: "Consulta privada",
        isPublic: false
      });

      const result = await searchPublicDoctors({ q: "Alma" });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        professionalName: "Dra. Alma Rivas",
        publicSlug,
        specialty: "GENERAL_MEDICINE",
        city: "Chihuahua",
        state: "Chihuahua",
        services: [{ name: "Consulta general" }]
      });
      expect(JSON.stringify(result.results[0])).not.toContain("licenseNumber");
      expect(JSON.stringify(result.results[0])).not.toContain("phone");
    } finally {
      await cleanupUserByEmail(publicEmail);
      await cleanupUserByEmail(privateEmail);
    }
  });

  it("finds doctors by city and specialty labels", async () => {
    const email = uniqueEmail("doctor-search-city-specialty");
    const slug = uniqueSlug("dr-odontologia-juarez");

    try {
      await createPublicDoctor({
        email,
        slug,
        professionalName: "Dr. Tomas Ibarra",
        specialty: ClinicalProfile.ODONTOLOGY,
        city: "Ciudad Juarez",
        state: "Chihuahua",
        serviceName: "Limpieza dental"
      });

      const byCity = await searchPublicDoctors({ city: "juarez" });
      const bySpecialty = await searchPublicDoctors({ specialty: "odontologia" });
      const byQuerySpecialty = await searchPublicDoctors({ q: "dentista juarez" });

      expect(byCity.results.some((doctor) => doctor.publicSlug === slug)).toBe(true);
      expect(bySpecialty.results.some((doctor) => doctor.publicSlug === slug)).toBe(true);
      expect(byQuerySpecialty.results.some((doctor) => doctor.publicSlug === slug)).toBe(true);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("returns no results for an empty search and rejects overlong filters", async () => {
    await expect(searchPublicDoctors({ q: "" })).resolves.toMatchObject({
      results: [],
      total: 0
    });

    await expect(searchPublicDoctors({ q: "a".repeat(81) })).rejects.toMatchObject({
      status: 400
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd V2\consultorio-app
npm run test -- tests/integration/doctor-search.integration.test.ts
```

Expected: FAIL because `src/services/doctor/doctor-search-service.ts` does not exist.

- [ ] **Step 3: Implement the service**

Create `V2/consultorio-app/src/services/doctor/doctor-search-service.ts`:

```ts
import { ClinicalProfile, DoctorServiceStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

const MAX_FILTER_LENGTH = 80;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

const searchInputSchema = z.object({
  q: z.string().trim().max(MAX_FILTER_LENGTH).optional(),
  city: z.string().trim().max(MAX_FILTER_LENGTH).optional(),
  specialty: z.string().trim().max(MAX_FILTER_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional()
});

export type PublicDoctorSearchInput = z.input<typeof searchInputSchema>;

export type PublicDoctorSearchResult = {
  id: string;
  professionalName: string;
  publicSlug: string;
  specialty: ClinicalProfile;
  city: string | null;
  state: string | null;
  profilePhoto: string | null;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    currency: string;
  }>;
};

function normalize(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function specialtyFromText(value: string | undefined): ClinicalProfile | undefined {
  const text = normalize(value)?.toLocaleLowerCase("es-MX");

  if (!text) {
    return undefined;
  }

  if (text.includes("odonto") || text.includes("dental") || text.includes("dentista")) {
    return ClinicalProfile.ODONTOLOGY;
  }

  if (text.includes("general") || text.includes("familiar") || text.includes("medicina")) {
    return ClinicalProfile.GENERAL_MEDICINE;
  }

  if (Object.values(ClinicalProfile).includes(value as ClinicalProfile)) {
    return value as ClinicalProfile;
  }

  return undefined;
}

function contains(value: string): Prisma.StringFilter {
  return {
    contains: value,
    mode: "insensitive"
  };
}

export async function searchPublicDoctors(input: PublicDoctorSearchInput) {
  const parsed = searchInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ServiceError("Parametros de busqueda invalidos.", 400);
  }

  const q = normalize(parsed.data.q);
  const city = normalize(parsed.data.city);
  const specialtyText = normalize(parsed.data.specialty);
  const specialty = specialtyFromText(specialtyText);
  const specialtyFromQuery = specialtyFromText(q);
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;

  if (!q && !city && !specialtyText) {
    return {
      results: [] as PublicDoctorSearchResult[],
      total: 0
    };
  }

  const andFilters: Prisma.DoctorProfileWhereInput[] = [
    {
      isPublic: true
    }
  ];

  if (city) {
    andFilters.push({
      OR: [
        { city: contains(city) },
        { state: contains(city) }
      ]
    });
  }

  if (specialtyText) {
    if (!specialty) {
      return {
        results: [] as PublicDoctorSearchResult[],
        total: 0
      };
    }

    andFilters.push({ specialty });
  }

  if (q) {
    const queryFilters: Prisma.DoctorProfileWhereInput[] = [
      { professionalName: contains(q) },
      { city: contains(q) },
      { state: contains(q) },
      {
        services: {
          some: {
            status: DoctorServiceStatus.ACTIVE,
            name: contains(q)
          }
        }
      }
    ];

    if (specialtyFromQuery) {
      queryFilters.push({ specialty: specialtyFromQuery });
    }

    andFilters.push({ OR: queryFilters });
  }

  const where: Prisma.DoctorProfileWhereInput = {
    AND: andFilters
  };

  const [profiles, total] = await Promise.all([
    prisma.doctorProfile.findMany({
      where,
      include: {
        services: {
          where: {
            status: DoctorServiceStatus.ACTIVE
          },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          take: 3
        }
      },
      orderBy: [{ professionalName: "asc" }],
      take: limit
    }),
    prisma.doctorProfile.count({ where })
  ]);

  return {
    results: profiles.map((profile) => ({
      id: profile.userId,
      professionalName: profile.professionalName,
      publicSlug: profile.publicSlug,
      specialty: profile.specialty,
      city: profile.city,
      state: profile.state,
      profilePhoto: profile.profilePhoto,
      services: profile.services.map((service) => ({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        currency: service.currency
      }))
    })),
    total
  };
}
```

- [ ] **Step 4: Run the service tests**

Run:

```powershell
cd V2\consultorio-app
npm run test -- tests/integration/doctor-search.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add V2/consultorio-app/src/services/doctor/doctor-search-service.ts V2/consultorio-app/tests/integration/doctor-search.integration.test.ts
git commit -m "feat: add public doctor search service"
```

## Task 2: Public Doctors Route Handler

**Files:**
- Create: `V2/consultorio-app/src/app/api/public/doctors/route.ts`
- Modify: `V2/consultorio-app/tests/integration/doctor-search.integration.test.ts`

- [ ] **Step 1: Add route handler tests**

Append these imports to the test file:

```ts
import { GET as searchDoctorsRoute } from "../../src/app/api/public/doctors/route";
```

Append these tests inside `describe("public doctor search", () => { ... })`:

```ts
  it("serves search results from the public route", async () => {
    const email = uniqueEmail("doctor-search-route");
    const slug = uniqueSlug("dra-ruta-publica");

    try {
      await createPublicDoctor({
        email,
        slug,
        professionalName: "Dra. Ruta Publica",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        city: "Chihuahua",
        state: "Chihuahua",
        serviceName: "Consulta de ruta"
      });

      const response = await searchDoctorsRoute(
        new Request("http://localhost/api/public/doctors?q=Ruta")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].publicSlug).toBe(slug);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("returns 400 from the public route for invalid search params", async () => {
    const response = await searchDoctorsRoute(
      new Request(`http://localhost/api/public/doctors?q=${"a".repeat(81)}`)
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Parametros de busqueda invalidos."
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
cd V2\consultorio-app
npm run test -- tests/integration/doctor-search.integration.test.ts
```

Expected: FAIL because `src/app/api/public/doctors/route.ts` does not exist.

- [ ] **Step 3: Implement the route handler**

Create `V2/consultorio-app/src/app/api/public/doctors/route.ts`:

```ts
import { NextResponse } from "next/server";

import { searchPublicDoctors } from "../../../../services/doctor/doctor-search-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await searchPublicDoctors({
      q: url.searchParams.get("q") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      specialty: url.searchParams.get("specialty") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible buscar medicos."
      },
      { status }
    );
  }
}
```

- [ ] **Step 4: Run the route tests**

Run:

```powershell
cd V2\consultorio-app
npm run test -- tests/integration/doctor-search.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add V2/consultorio-app/src/app/api/public/doctors/route.ts V2/consultorio-app/tests/integration/doctor-search.integration.test.ts
git commit -m "feat: expose public doctor search route"
```

## Task 3: Search Results Page

**Files:**
- Create: `V2/consultorio-app/src/app/buscar/page.tsx`
- Create: `V2/consultorio-app/src/app/buscar/loading.tsx`

- [ ] **Step 1: Create the search results page**

Create `V2/consultorio-app/src/app/buscar/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { searchPublicDoctors, type PublicDoctorSearchResult } from "../../services/doctor/doctor-search-service";

export const metadata: Metadata = {
  title: "Buscar medico"
};

const specialtyLabels: Record<PublicDoctorSearchResult["specialty"], string> = {
  GENERAL_MEDICINE: "Medicina general",
  ODONTOLOGY: "Odontologia"
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function SearchResultCard({ doctor }: { doctor: PublicDoctorSearchResult }) {
  const location = [doctor.city, doctor.state].filter(Boolean).join(", ");
  const initials = doctor.professionalName
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <article className="search-result-card">
      {doctor.profilePhoto ? (
        <div
          className="search-result-avatar"
          style={{ backgroundImage: `url(${doctor.profilePhoto})` }}
          role="img"
          aria-label={`Retrato de ${doctor.professionalName}`}
        />
      ) : (
        <div className="search-result-avatar search-result-avatar-fallback" aria-hidden>
          {initials}
        </div>
      )}
      <div className="search-result-main">
        <p className="search-result-specialty">{specialtyLabels[doctor.specialty]}</p>
        <h2>{doctor.professionalName}</h2>
        {location && <p className="search-result-location">{location}</p>}
        {doctor.services.length > 0 && (
          <ul className="search-result-services" aria-label="Servicios activos">
            {doctor.services.map((service) => (
              <li key={service.id}>{service.name}</li>
            ))}
          </ul>
        )}
      </div>
      <Link className="action-button search-result-action" href={`/perfil/${doctor.publicSlug}`}>
        Ver perfil
      </Link>
    </article>
  );
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = firstParam(params.q) ?? "";
  const city = firstParam(params.city) ?? "";
  const specialty = firstParam(params.specialty) ?? "";
  const hasSearch = Boolean(q.trim() || city.trim() || specialty.trim());
  const result = hasSearch ? await searchPublicDoctors({ q, city, specialty }) : { results: [], total: 0 };

  return (
    <section className="search-page">
      <header className="search-page-header">
        <Link href="/" className="brand-mark">MiDoc</Link>
        <Link href="/medico/registro" className="ghost-button">Soy medico</Link>
      </header>

      <section className="search-panel" aria-labelledby="search-title">
        <div>
          <p className="section-kicker">Busca y agenda</p>
          <h1 id="search-title">Encuentra a tu medico</h1>
          <p>
            Busca por nombre, ciudad o especialidad. Despues abre el perfil publico para revisar servicios y agendar.
          </p>
        </div>

        <form className="doctor-search-form" action="/buscar" role="search">
          <label className="field">
            <span>Nombre, ciudad o especialidad</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Ej. medicina general en Chihuahua"
              autoComplete="off"
              aria-describedby="search-help"
            />
          </label>
          <p id="search-help" className="field-hint">
            Tambien puedes buscar odontologia, dentista, medicina familiar o el nombre de tu doctor.
          </p>
          <button className="action-button" type="submit">Buscar medico</button>
        </form>
      </section>

      <section className="search-results-section" aria-live="polite">
        {!hasSearch && (
          <div className="empty-state">
            <strong>Empieza con una busqueda</strong>
            <p>Prueba con el nombre del medico, tu ciudad o una especialidad.</p>
          </div>
        )}

        {hasSearch && result.results.length === 0 && (
          <div className="empty-state">
            <strong>No encontramos medicos publicados con esa busqueda</strong>
            <p>Revisa la escritura, cambia la ciudad o pide al consultorio su enlace directo.</p>
          </div>
        )}

        {result.results.length > 0 && (
          <>
            <p className="search-count">
              {result.total === 1 ? "1 medico encontrado" : `${result.total} medicos encontrados`}
            </p>
            <div className="search-results-list">
              {result.results.map((doctor) => (
                <SearchResultCard key={doctor.publicSlug} doctor={doctor} />
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
```

- [ ] **Step 2: Create the loading skeleton**

Create `V2/consultorio-app/src/app/buscar/loading.tsx`:

```tsx
export default function SearchLoading() {
  return (
    <section className="search-page">
      <header className="search-page-header">
        <span className="brand-mark">MiDoc</span>
      </header>
      <section className="search-panel">
        <div className="skeleton-row" />
        <div className="skeleton-row" />
      </section>
      <section className="search-results-section" aria-label="Cargando resultados">
        <div className="skeleton-row" />
        <div className="skeleton-row" />
        <div className="skeleton-row" />
      </section>
    </section>
  );
}
```

- [ ] **Step 3: Run a syntax-oriented TypeScript check through lint**

Run:

```powershell
cd V2\consultorio-app
npm run lint
```

Expected: PASS or only CSS-independent issues already present before this task. If lint reports an error in `src/app/buscar/page.tsx` or `src/app/buscar/loading.tsx`, fix it before committing.

- [ ] **Step 4: Commit**

Run:

```powershell
git add V2/consultorio-app/src/app/buscar/page.tsx V2/consultorio-app/src/app/buscar/loading.tsx
git commit -m "feat: add public doctor search page"
```

## Task 4: Patient-First Homepage

**Files:**
- Modify: `V2/consultorio-app/src/app/page.tsx`
- Modify: `V2/consultorio-app/tests/smoke/homepage.test.ts`

- [ ] **Step 1: Update the smoke test**

Replace `V2/consultorio-app/tests/smoke/homepage.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

describe("homepage copy", () => {
  it("centers the patient search task", () => {
    const heading = "Encuentra a tu medico y agenda tu consulta";
    const action = "Buscar medico";

    expect(heading).toContain("Encuentra");
    expect(action).toBe("Buscar medico");
  });
});
```

- [ ] **Step 2: Replace the homepage**

Replace `V2/consultorio-app/src/app/page.tsx` with:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <section className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="brand-mark">MiDoc</Link>
        <nav aria-label="Navegacion principal">
          <Link href="/paciente/login">Portal paciente</Link>
          <Link href="/medico/registro" className="ghost-button">Soy medico</Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="section-kicker">Busca y agenda</p>
          <h1 id="landing-title">Encuentra a tu medico y agenda tu consulta</h1>
          <p>
            Busca por nombre, ciudad o especialidad. Revisa el perfil publico del consultorio y reserva un horario disponible.
          </p>

          <form className="doctor-search-form landing-search-form" action="/buscar" role="search">
            <label className="field">
              <span>Nombre, ciudad o especialidad</span>
              <input
                name="q"
                placeholder="Ej. odontologia en Chihuahua"
                autoComplete="off"
                aria-describedby="landing-search-help"
              />
            </label>
            <p id="landing-search-help" className="field-hint">
              Puedes escribir el nombre de tu doctor, tu ciudad o una especialidad.
            </p>
            <button className="action-button" type="submit">Buscar medico</button>
          </form>
        </div>

        <aside className="landing-appointment-preview" aria-label="Vista previa de agenda publica">
          <div className="preview-topline">
            <span>Agenda publica</span>
            <strong>Hoy</strong>
          </div>
          <div className="preview-slot">
            <span>Consulta general</span>
            <strong>09:30</strong>
          </div>
          <div className="preview-slot">
            <span>Seguimiento</span>
            <strong>11:00</strong>
          </div>
          <div className="preview-slot">
            <span>Odontologia</span>
            <strong>16:30</strong>
          </div>
        </aside>
      </section>

      <section className="landing-info-grid" aria-label="Como funciona MiDoc">
        <article>
          <h2>Para pacientes</h2>
          <p>Encuentra el perfil de tu medico, revisa servicios y agenda desde el navegador.</p>
        </article>
        <article>
          <h2>Para medicos</h2>
          <p>Publica perfil, servicios y horarios para que tus pacientes puedan reservar sin llamadas de ida y vuelta.</p>
          <Link href="/medico/registro">Crear cuenta medica</Link>
        </article>
        <article>
          <h2>Privacidad local-first</h2>
          <p>La nube opera agenda y notificaciones. El expediente clinico vive cifrado en la app del medico.</p>
        </article>
      </section>
    </section>
  );
}
```

- [ ] **Step 3: Run the homepage smoke test**

Run:

```powershell
cd V2\consultorio-app
npm run test -- tests/smoke/homepage.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
git add V2/consultorio-app/src/app/page.tsx V2/consultorio-app/tests/smoke/homepage.test.ts
git commit -m "feat: add patient-first landing page"
```

## Task 5: Landing And Search Styles

**Files:**
- Modify: `V2/consultorio-app/src/app/globals.css`

- [ ] **Step 1: Add CSS using existing tokens**

Append this block before `/* ---------- Responsive ---------- */` in `V2/consultorio-app/src/app/globals.css`:

```css
/* ---------- Landing paciente y busqueda publica ---------- */

.landing-page,
.search-page {
  display: grid;
  gap: 40px;
}

.landing-nav,
.search-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.landing-nav nav {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  font-size: 0.92rem;
  font-weight: 500;
}

.landing-nav nav a:not(.ghost-button):hover {
  color: var(--ink);
}

.landing-hero {
  display: grid;
  gap: 32px;
  align-items: center;
  min-height: min(680px, calc(100dvh - 112px));
  padding: 28px 0 16px;
}

.landing-hero-copy {
  display: grid;
  gap: 18px;
  align-content: center;
}

.landing-hero-copy h1,
.search-page h1 {
  margin: 0;
  max-width: 12ch;
  font-size: 2.48rem;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.landing-hero-copy p,
.search-panel p {
  margin: 0;
  color: var(--muted);
  font-size: 1.07rem;
}

.doctor-search-form {
  display: grid;
  gap: 10px;
}

.landing-search-form,
.search-panel .doctor-search-form {
  max-width: 620px;
}

.doctor-search-form .action-button {
  min-height: 44px;
}

.doctor-search-form input {
  min-height: 44px;
}

.landing-appointment-preview {
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  background: var(--surface);
  padding: 18px;
  display: grid;
  gap: 10px;
}

.preview-topline,
.preview-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.preview-topline {
  color: var(--muted);
  font-size: 0.92rem;
}

.preview-slot {
  min-height: 48px;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--bg);
  padding: 0 12px;
}

.preview-slot strong {
  color: var(--primary);
  font-variant-numeric: tabular-nums;
}

.landing-info-grid {
  display: grid;
  gap: 16px;
}

.landing-info-grid article {
  border-top: 1px solid var(--line);
  padding-top: 18px;
}

.landing-info-grid h2 {
  margin: 0 0 8px;
}

.landing-info-grid p {
  margin: 0;
  color: var(--muted);
}

.landing-info-grid a {
  display: inline-flex;
  margin-top: 12px;
  color: var(--primary);
  font-weight: 600;
}

.landing-info-grid a:hover {
  text-decoration: underline;
}

.search-page {
  gap: 24px;
}

.search-panel {
  display: grid;
  gap: 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  background: var(--surface);
  padding: 24px;
}

.search-results-section {
  display: grid;
  gap: 14px;
}

.search-count {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  font-weight: 500;
}

.search-results-list {
  display: grid;
  gap: 12px;
}

.search-result-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  background: var(--bg);
  padding: 16px;
}

.search-result-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: var(--primary-soft);
  background-position: center;
  background-size: cover;
  flex-shrink: 0;
}

.search-result-avatar-fallback {
  display: grid;
  place-items: center;
  color: var(--primary);
  font-weight: 700;
}

.search-result-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.search-result-specialty,
.search-result-location {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.search-result-main h2 {
  margin: 0;
  font-size: 1.2rem;
}

.search-result-services {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.search-result-services li {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 9px;
  color: var(--muted);
  font-size: 0.84rem;
}

.search-result-action {
  white-space: nowrap;
}
```

- [ ] **Step 2: Add responsive CSS**

Add these rules inside the existing `@media (min-width: 860px)` block:

```css
  .landing-hero {
    grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  }

  .landing-info-grid {
    grid-template-columns: 1.1fr 1fr 1fr;
  }

  .search-panel {
    grid-template-columns: minmax(0, 0.8fr) minmax(360px, 1fr);
    align-items: end;
  }
```

Add these rules inside the existing `@media (max-width: 859px)` block:

```css
  .landing-nav,
  .search-page-header {
    align-items: flex-start;
  }

  .landing-nav nav {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .landing-hero {
    min-height: auto;
  }

  .landing-hero-copy h1,
  .search-page h1 {
    max-width: 100%;
    font-size: 2.07rem;
  }

  .search-result-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .search-result-action {
    grid-column: 1 / -1;
    width: 100%;
  }
```

- [ ] **Step 3: Run lint and build**

Run:

```powershell
cd V2\consultorio-app
npm run lint
npm run build
```

Expected: both commands pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add V2/consultorio-app/src/app/globals.css
git commit -m "style: polish landing and doctor search"
```

## Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted test suite**

Run:

```powershell
cd V2\consultorio-app
npm run test -- tests/integration/doctor-search.integration.test.ts tests/smoke/homepage.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full baseline**

Run:

```powershell
cd V2\consultorio-app
npm run test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 3: Start the dev server**

Run:

```powershell
cd V2\consultorio-app
npm run dev
```

Expected: Next reports a local URL, usually `http://localhost:3000`.

- [ ] **Step 4: Browser verification**

Open the local URL and verify:

- `/` shows `Encuentra a tu medico y agenda tu consulta`.
- The search form submits to `/buscar?q=odontologia+en+Chihuahua`.
- `/buscar` empty state appears with no query.
- `/buscar?q=<known-public-doctor-name>` shows a result.
- `Ver perfil` opens `/perfil/[slug]`.
- Mobile viewport around 375px has no horizontal scroll and all controls remain at least 44px tall.

- [ ] **Step 5: Final commit if verification required edits**

If verification required changes, commit those changes:

```powershell
git add V2/consultorio-app
git commit -m "fix: finish landing search verification"
```

If verification required no changes, do not create an empty commit.

## Self-Review

- Spec coverage: The plan covers public-only search, `/buscar`, homepage, route handler, empty/loading/error-capable UI structure, privacy guardrails, and verification.
- Placeholder scan: No task relies on undefined placeholders, deferred validation, or unspecified files.
- Type consistency: `searchPublicDoctors`, `PublicDoctorSearchResult`, `q`, `city`, `specialty`, and `limit` are defined in Task 1 and reused consistently in later tasks.
