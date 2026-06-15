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
      OR: [{ city: contains(city) }, { state: contains(city) }]
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
