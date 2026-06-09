import {
  getAuthenticatedMedicalContext,
  getAuthenticatedUser,
  type AuthenticatedRole,
  type AuthenticatedUser,
} from "@/lib/auth";
import { jsonNoStore } from "@/lib/http";
import {
  getDoctorProductAccess,
  hasModuleAccess,
  PRODUCT_MODULES,
  type ProductAccess,
  type ProductModule,
} from "@/lib/productAccess";
import { SUBSCRIPTION_FEATURES, type SubscriptionFeatureKey } from "@/lib/subscriptionFeatures";

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

type StaffApiAccessResult = {
  user: null;
  response: Response;
} | {
  user: AuthenticatedUser;
  response: null;
};

type RequireProductApiAccessOptions = {
  allowSecretary?: boolean;
  requiredModule: ProductModule;
  requiredFeature?: SubscriptionFeatureKey;
  roleForbiddenMessage: string;
  moduleForbiddenMessage: string;
  featureForbiddenMessage?: string;
};

function hasRequiredFeature(
  access: ProductAccess,
  feature: NonNullable<RequireProductApiAccessOptions["requiredFeature"]>,
) {
  const features = access.features;
  if (feature === SUBSCRIPTION_FEATURES.AI_ENABLED) {
    return features[feature] === true;
  }

  if (feature.startsWith("ai.") && features[SUBSCRIPTION_FEATURES.AI_ENABLED] !== true) {
    return false;
  }

  return features[feature] === true;
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
  requiredFeature?: SubscriptionFeatureKey;
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
    requiredFeature: undefined,
    roleForbiddenMessage: "No autorizado para acceder a la agenda.",
    moduleForbiddenMessage: "El módulo de agenda no está incluido en tu plan.",
  });
}

export async function requireAgendaAccess(options?: {
  allowSecretary?: boolean;
  requiredFeature?: SubscriptionFeatureKey;
  featureForbiddenMessage?: string;
}) {
  return requireProductApiAccess({
    allowSecretary: options?.allowSecretary ?? true,
    requiredModule: PRODUCT_MODULES.AGENDA,
    requiredFeature: options?.requiredFeature,
    roleForbiddenMessage: "No autorizado para acceder a la agenda.",
    moduleForbiddenMessage: "El módulo de agenda no está incluido en tu plan.",
    featureForbiddenMessage:
      options?.featureForbiddenMessage ??
      "La función solicitada de agenda no está incluida en tu plan.",
  });
}

export async function requireClinicalAccess(options?: {
  requiredFeature?: SubscriptionFeatureKey;
  featureForbiddenMessage?: string;
}) {
  return requireProductApiAccess({
    allowSecretary: false,
    requiredModule: PRODUCT_MODULES.CLINICAL_RECORDS,
    requiredFeature: options?.requiredFeature,
    roleForbiddenMessage:
      "Acceso denegado. El rol Asistente no puede consultar expedientes médicos.",
    moduleForbiddenMessage: "El módulo de expediente clínico no está incluido en tu plan.",
    featureForbiddenMessage:
      options?.featureForbiddenMessage ??
      "La función solicitada del expediente clínico no está incluida en tu plan.",
  });
}

export async function requireAiAccess(options: {
  allowSecretary?: boolean;
  requiredFeature?: SubscriptionFeatureKey;
}) {
  const requiredFeature = options.requiredFeature ?? SUBSCRIPTION_FEATURES.AI_ENABLED;

  return requireProductApiAccess({
    allowSecretary: options.allowSecretary ?? false,
    requiredModule: PRODUCT_MODULES.CLINICAL_RECORDS,
    requiredFeature,
    roleForbiddenMessage:
      "Acceso denegado. El rol Asistente no puede consultar funcionalidades de IA clínica.",
    moduleForbiddenMessage: "El módulo de expediente clínico no está incluido en tu plan.",
    featureForbiddenMessage: "La función de IA clínica no está incluida en tu plan.",
  });
}

export async function requireFeature(
  feature: SubscriptionFeatureKey,
  options?: {
    allowSecretary?: boolean;
    requiredModule?: ProductModule;
    roleForbiddenMessage?: string;
    moduleForbiddenMessage?: string;
    featureForbiddenMessage?: string;
  },
) {
  return requireProductApiAccess({
    allowSecretary: options?.allowSecretary ?? false,
    requiredModule: options?.requiredModule ?? PRODUCT_MODULES.CLINICAL_RECORDS,
    requiredFeature: feature,
    roleForbiddenMessage: options?.roleForbiddenMessage ?? "No autorizado",
    moduleForbiddenMessage:
      options?.moduleForbiddenMessage ??
      "El módulo requerido no está incluido en tu plan.",
    featureForbiddenMessage:
      options?.featureForbiddenMessage ??
      "La función solicitada no está incluida en tu plan.",
  });
}

export async function requireStaffApiAccess(options: {
  allowedRoles: AuthenticatedRole[];
  roleForbiddenMessage?: string;
}): Promise<StaffApiAccessResult> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      user: null,
      response: jsonNoStore({ error: "No autorizado" }, { status: 401 }),
    };
  }

  if (!options.allowedRoles.includes(user.role)) {
    return {
      user: null,
      response: jsonNoStore(
        { error: options.roleForbiddenMessage ?? "No autorizado" },
        { status: 403 },
      ),
    };
  }

  return { user, response: null };
}
