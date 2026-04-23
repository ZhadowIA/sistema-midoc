import { getAuthenticatedMedicalContext, getAuthenticatedUser } from "@/lib/auth";
import { jsonNoStore } from "@/lib/http";
import {
  getDoctorProductAccess,
  hasModuleAccess,
  PRODUCT_MODULES,
  type ProductAccess,
  type ProductModule,
} from "@/lib/productAccess";

type AccessContext = Awaited<ReturnType<typeof getAuthenticatedMedicalContext>>;

type ProductApiAccessResult = {
  context: null;
  access: null;
  response: Response;
} | {
  context: NonNullable<AccessContext>;
  access: ProductAccess;
  response: null;
};

type RequireProductApiAccessOptions = {
  allowSecretary?: boolean;
  requiredModule: ProductModule;
  requiredFeature?: "ai.dictation" | "ai.insights";
  roleForbiddenMessage: string;
  moduleForbiddenMessage: string;
  featureForbiddenMessage?: string;
};

function hasRequiredFeature(
  access: ProductAccess,
  feature: NonNullable<RequireProductApiAccessOptions["requiredFeature"]>,
) {
  const features = access.features;
  return features["ai.enabled"] === true && features[feature] === true;
}

async function requireProductApiAccess(
  options: RequireProductApiAccessOptions,
): Promise<ProductApiAccessResult> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      context: null,
      access: null,
      response: jsonNoStore({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const context = await getAuthenticatedMedicalContext({
    allowSecretary: options.allowSecretary ?? false,
  });
  if (!context) {
    return {
      context: null,
      access: null,
      response: jsonNoStore({ error: options.roleForbiddenMessage }, { status: 403 }),
    };
  }

  const access = await getDoctorProductAccess(context.doctorId, context.user.role);
  if (!hasModuleAccess(access, options.requiredModule)) {
    return {
      context: null,
      access: null,
      response: jsonNoStore({ error: options.moduleForbiddenMessage }, { status: 403 }),
    };
  }

  if (options.requiredFeature && !hasRequiredFeature(access, options.requiredFeature)) {
    return {
      context: null,
      access: null,
      response: jsonNoStore(
        {
          error:
            options.featureForbiddenMessage ??
            "La función solicitada no está incluida en tu plan.",
        },
        { status: 403 },
      ),
    };
  }

  return { context, access, response: null };
}

export async function requireMedicalDoctorApiAccess(options?: {
  requiredFeature?: "ai.dictation" | "ai.insights";
}) {
  return requireProductApiAccess({
    allowSecretary: false,
    requiredModule: PRODUCT_MODULES.CLINICAL_RECORDS,
    requiredFeature: options?.requiredFeature,
    roleForbiddenMessage:
      "Acceso denegado. El rol Asistente no puede consultar expedientes médicos.",
    moduleForbiddenMessage: "El módulo de expediente clínico no está incluido en tu plan.",
    featureForbiddenMessage: "La función de IA clínica no está incluida en tu plan.",
  });
}

export async function requireAgendaDoctorApiAccess(options?: { allowSecretary?: boolean }) {
  return requireProductApiAccess({
    allowSecretary: options?.allowSecretary ?? true,
    requiredModule: PRODUCT_MODULES.AGENDA,
    roleForbiddenMessage: "No autorizado para acceder a la agenda.",
    moduleForbiddenMessage: "El módulo de agenda no está incluido en tu plan.",
  });
}
