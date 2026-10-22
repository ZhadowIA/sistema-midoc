/**
 * Tipos y formato de las marcas del medico (paso 33, etapa 3). Modulo puro
 * para poder probarlo con `node --test`.
 */

export interface IngredientOption {
  id: string;
  display: string;
  cnis: boolean;
  has_interaction_data: boolean;
}

export interface BrandIngredient {
  id: string;
  display: string;
}

export interface LocalBrand {
  id: string;
  display: string;
  ingredients: BrandIngredient[];
  created_at: string;
}

export interface UnknownMedication {
  line: string;
  candidate: string;
}

/** "Fictimed → Paracetamol + Cafeína". */
export function brandSummary(brand: Pick<LocalBrand, "display" | "ingredients">): string {
  const parts = brand.ingredients.map((ingredient) => ingredient.display);
  return `${brand.display} → ${parts.length > 0 ? parts.join(" + ") : "sin principios activos"}`;
}
