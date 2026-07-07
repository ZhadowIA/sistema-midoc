//! Datos fuente curados para el pipeline del paso 25 (rebanada 1).
//!
//! PROCEDENCIA Y LICENCIA
//! - Reglas de interaccion: lista de interacciones farmaco-farmaco de ALTA
//!   PRIORIDAD del panel ONC/Phansalkar (ONChigh), de DOMINIO PUBLICO (RAND
//!   cedio al gobierno de EE. UU. licencia mundial irrevocable). Fue una de las
//!   dos fuentes de la Drug Interaction API de la NLM (discontinuada 2024).
//!   Ref.: Phansalkar S. et al., "High-priority drug-drug interactions for use
//!   in electronic health records", JAMIA 2012; PMC3422823.
//! - Los ingredientes usan el vocabulario INGLES de RxNorm, igual que la columna
//!   `ingredient` de medications.csv, para que el motor los empareje.
//!
//! ALCANCE (rebanada 1): subconjunto curado a mano y VERIFICABLE. ONChigh se
//! publica en apendices de articulos, no como CSV oficial descargable; la
//! transcripcion de la lista completa y el fetch reproducible de los miembros
//! de clase desde RxClass se revisan juntos en la rebanada siguiente. Cada
//! regla que falte esta marcada con TODO(onchigh-full).

import type { ClassMembers, ClassRule, MedicationRow } from "./reference.ts";

/**
 * Miembros por clase terapeutica (subconjunto). En la version completa este
 * mapa se deriva de RxClass (ATC/MoA) por el pipeline; aqui se curó a mano el
 * nucleo relevante para consultorio de primer nivel en Mexico.
 * TODO(onchigh-full): reemplazar por extraccion reproducible desde RxClass.
 */
export const CLASS_MEMBERS: ClassMembers = {
  Anticoagulante: ["warfarin", "acenocoumarol"],
  AINE: ["ibuprofen", "naproxen", "diclofenac", "ketorolac", "meloxicam", "aspirin"],
  Antiplaquetario: ["aspirin", "clopidogrel"],
  IECA: ["enalapril", "lisinopril", "captopril", "ramipril"],
  ARA2: ["losartan", "valsartan", "telmisartan"],
  "Ahorrador de potasio": ["spironolactone", "amiloride", "eplerenone"],
  "Suplemento de potasio": ["potassium chloride"],
  Nitrato: ["nitroglycerin", "isosorbide dinitrate", "isosorbide mononitrate"],
  "Inhibidor PDE5": ["sildenafil", "tadalafil", "vardenafil"],
  IMAO: ["phenelzine", "tranylcypromine", "linezolid", "selegiline"],
  ISRS: ["fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram"],
  IRSN: ["venlafaxine", "duloxetine"],
  "Opioide serotoninergico": ["tramadol", "fentanyl", "meperidine"],
  Benzodiacepina: ["diazepam", "alprazolam", "clonazepam", "lorazepam"],
  Opioide: ["morphine", "hydrocodone", "oxycodone", "codeine", "tramadol"],
  "Estatina CYP3A4": ["simvastatin", "lovastatin", "atorvastatin"],
  "Inhibidor fuerte CYP3A4": ["clarithromycin", "erythromycin", "ketoconazole", "itraconazole"],
  Metotrexato: ["methotrexate"],
  "Antibiotico antifolato": ["trimethoprim", "sulfamethoxazole"]
};

/**
 * Reglas de interaccion por clase (ALTA PRIORIDAD ONChigh). Severidad:
 * CONTRAINDICATED para pares que no deben coadministrarse; MAJOR para los que
 * exigen alerta interruptiva. Descripcion en es-MX (texto que ve el medico).
 */
export const ONCHIGH_RULES: ClassRule[] = [
  {
    classA: "Anticoagulante",
    classB: "AINE",
    severity: "MAJOR",
    description: "Riesgo aumentado de sangrado por efecto sinergico sobre la hemostasia."
  },
  {
    classA: "Anticoagulante",
    classB: "Antiplaquetario",
    severity: "MAJOR",
    description: "Riesgo aumentado de sangrado por inhibicion plaquetaria concomitante."
  },
  {
    classA: "Anticoagulante",
    classB: "Antibiotico antifolato",
    severity: "MAJOR",
    description: "Sulfametoxazol/trimetoprima potencia el efecto anticoagulante: riesgo de sangrado."
  },
  {
    classA: "IECA",
    classB: "Ahorrador de potasio",
    severity: "MAJOR",
    description: "Riesgo de hiperpotasemia por retencion de potasio."
  },
  {
    classA: "IECA",
    classB: "Suplemento de potasio",
    severity: "MAJOR",
    description: "Riesgo de hiperpotasemia por aporte externo de potasio."
  },
  {
    classA: "ARA2",
    classB: "Ahorrador de potasio",
    severity: "MAJOR",
    description: "Riesgo de hiperpotasemia por retencion de potasio."
  },
  {
    classA: "ARA2",
    classB: "Suplemento de potasio",
    severity: "MAJOR",
    description: "Riesgo de hiperpotasemia por aporte externo de potasio."
  },
  {
    classA: "Nitrato",
    classB: "Inhibidor PDE5",
    severity: "CONTRAINDICATED",
    description: "Hipotension grave por vasodilatacion sumada: combinacion contraindicada."
  },
  {
    classA: "IMAO",
    classB: "ISRS",
    severity: "CONTRAINDICATED",
    description: "Sindrome serotoninergico: no coadministrar; respetar periodo de lavado."
  },
  {
    classA: "IMAO",
    classB: "IRSN",
    severity: "CONTRAINDICATED",
    description: "Sindrome serotoninergico: no coadministrar; respetar periodo de lavado."
  },
  {
    classA: "IMAO",
    classB: "Opioide serotoninergico",
    severity: "CONTRAINDICATED",
    description: "Sindrome serotoninergico o toxicidad opioide: combinacion contraindicada."
  },
  {
    classA: "ISRS",
    classB: "Opioide serotoninergico",
    severity: "MAJOR",
    description: "Riesgo de sindrome serotoninergico por efecto serotoninergico sumado."
  },
  {
    classA: "Opioide",
    classB: "Benzodiacepina",
    severity: "MAJOR",
    description: "Depresion respiratoria, sedacion profunda y riesgo de muerte por depresion del SNC sumada."
  },
  {
    classA: "Estatina CYP3A4",
    classB: "Inhibidor fuerte CYP3A4",
    severity: "MAJOR",
    description: "Riesgo de miopatia/rabdomiolisis por aumento de la concentracion de la estatina."
  },
  {
    classA: "Metotrexato",
    classB: "Antibiotico antifolato",
    severity: "MAJOR",
    description: "Toxicidad por metotrexato (mielosupresion) por efecto antifolato sumado."
  },
  {
    classA: "Metotrexato",
    classB: "AINE",
    severity: "MAJOR",
    description: "Aumento del riesgo de toxicidad por metotrexato (mielosupresion, dano renal)."
  }
  // TODO(onchigh-full): completar el resto de la lista ONChigh (QT largo,
  // digoxina, alopurinol+azatioprina, etc.) al transcribir el apendice completo.
];

/**
 * Base de medicamentos minima: cada ingrediente referido por una regla existe
 * en la tabla para que la base sea autoconsistente. Display en es-MX y clase
 * para duplicidad/alergia cruzada. Los ALIAS de marca comercial mexicana
 * (COFEPRIS / Compendio Nacional) son la rebanada 2; aqui van solo unos pocos
 * de ejemplo para demostrar el mecanismo name -> ingredient.
 * TODO(cofepris): generar la capa completa de marcas desde el registro sanitario.
 */
export const BASE_MEDICATIONS: MedicationRow[] = [
  { name: "warfarin", ingredient: "warfarin", displayName: "Warfarina", drugClass: "Anticoagulante" },
  { name: "warfarina", ingredient: "warfarin", displayName: "Warfarina", drugClass: "Anticoagulante" },
  { name: "acenocoumarol", ingredient: "acenocoumarol", displayName: "Acenocumarol", drugClass: "Anticoagulante" },
  { name: "ibuprofen", ingredient: "ibuprofen", displayName: "Ibuprofeno", drugClass: "AINE" },
  { name: "ibuprofeno", ingredient: "ibuprofen", displayName: "Ibuprofeno", drugClass: "AINE" },
  { name: "advil", ingredient: "ibuprofen", displayName: "Ibuprofeno", drugClass: "AINE" },
  { name: "naproxen", ingredient: "naproxen", displayName: "Naproxeno", drugClass: "AINE" },
  { name: "naproxeno", ingredient: "naproxen", displayName: "Naproxeno", drugClass: "AINE" },
  { name: "diclofenac", ingredient: "diclofenac", displayName: "Diclofenaco", drugClass: "AINE" },
  { name: "diclofenaco", ingredient: "diclofenac", displayName: "Diclofenaco", drugClass: "AINE" },
  { name: "ketorolac", ingredient: "ketorolac", displayName: "Ketorolaco", drugClass: "AINE" },
  { name: "meloxicam", ingredient: "meloxicam", displayName: "Meloxicam", drugClass: "AINE" },
  { name: "aspirin", ingredient: "aspirin", displayName: "Aspirina", drugClass: "Antiplaquetario" },
  { name: "aspirina", ingredient: "aspirin", displayName: "Aspirina", drugClass: "Antiplaquetario" },
  { name: "clopidogrel", ingredient: "clopidogrel", displayName: "Clopidogrel", drugClass: "Antiplaquetario" },
  { name: "enalapril", ingredient: "enalapril", displayName: "Enalapril", drugClass: "IECA" },
  { name: "lisinopril", ingredient: "lisinopril", displayName: "Lisinopril", drugClass: "IECA" },
  { name: "captopril", ingredient: "captopril", displayName: "Captopril", drugClass: "IECA" },
  { name: "ramipril", ingredient: "ramipril", displayName: "Ramipril", drugClass: "IECA" },
  { name: "losartan", ingredient: "losartan", displayName: "Losartan", drugClass: "ARA2" },
  { name: "valsartan", ingredient: "valsartan", displayName: "Valsartan", drugClass: "ARA2" },
  { name: "telmisartan", ingredient: "telmisartan", displayName: "Telmisartan", drugClass: "ARA2" },
  { name: "spironolactone", ingredient: "spironolactone", displayName: "Espironolactona", drugClass: "Ahorrador de potasio" },
  { name: "espironolactona", ingredient: "spironolactone", displayName: "Espironolactona", drugClass: "Ahorrador de potasio" },
  { name: "amiloride", ingredient: "amiloride", displayName: "Amilorida", drugClass: "Ahorrador de potasio" },
  { name: "eplerenone", ingredient: "eplerenone", displayName: "Eplerenona", drugClass: "Ahorrador de potasio" },
  { name: "potassium chloride", ingredient: "potassium chloride", displayName: "Cloruro de potasio", drugClass: "Suplemento de potasio" },
  { name: "cloruro de potasio", ingredient: "potassium chloride", displayName: "Cloruro de potasio", drugClass: "Suplemento de potasio" },
  { name: "nitroglycerin", ingredient: "nitroglycerin", displayName: "Nitroglicerina", drugClass: "Nitrato" },
  { name: "isosorbide dinitrate", ingredient: "isosorbide dinitrate", displayName: "Dinitrato de isosorbida", drugClass: "Nitrato" },
  { name: "isosorbide mononitrate", ingredient: "isosorbide mononitrate", displayName: "Mononitrato de isosorbida", drugClass: "Nitrato" },
  { name: "sildenafil", ingredient: "sildenafil", displayName: "Sildenafil", drugClass: "Inhibidor PDE5" },
  { name: "tadalafil", ingredient: "tadalafil", displayName: "Tadalafil", drugClass: "Inhibidor PDE5" },
  { name: "vardenafil", ingredient: "vardenafil", displayName: "Vardenafil", drugClass: "Inhibidor PDE5" },
  { name: "phenelzine", ingredient: "phenelzine", displayName: "Fenelzina", drugClass: "IMAO" },
  { name: "tranylcypromine", ingredient: "tranylcypromine", displayName: "Tranilcipromina", drugClass: "IMAO" },
  { name: "linezolid", ingredient: "linezolid", displayName: "Linezolid", drugClass: "IMAO" },
  { name: "selegiline", ingredient: "selegiline", displayName: "Selegilina", drugClass: "IMAO" },
  { name: "fluoxetine", ingredient: "fluoxetine", displayName: "Fluoxetina", drugClass: "ISRS" },
  { name: "fluoxetina", ingredient: "fluoxetine", displayName: "Fluoxetina", drugClass: "ISRS" },
  { name: "sertraline", ingredient: "sertraline", displayName: "Sertralina", drugClass: "ISRS" },
  { name: "sertralina", ingredient: "sertraline", displayName: "Sertralina", drugClass: "ISRS" },
  { name: "paroxetine", ingredient: "paroxetine", displayName: "Paroxetina", drugClass: "ISRS" },
  { name: "citalopram", ingredient: "citalopram", displayName: "Citalopram", drugClass: "ISRS" },
  { name: "escitalopram", ingredient: "escitalopram", displayName: "Escitalopram", drugClass: "ISRS" },
  { name: "venlafaxine", ingredient: "venlafaxine", displayName: "Venlafaxina", drugClass: "IRSN" },
  { name: "duloxetine", ingredient: "duloxetine", displayName: "Duloxetina", drugClass: "IRSN" },
  { name: "tramadol", ingredient: "tramadol", displayName: "Tramadol", drugClass: "Opioide serotoninergico" },
  { name: "fentanyl", ingredient: "fentanyl", displayName: "Fentanilo", drugClass: "Opioide" },
  { name: "meperidine", ingredient: "meperidine", displayName: "Meperidina", drugClass: "Opioide serotoninergico" },
  { name: "diazepam", ingredient: "diazepam", displayName: "Diazepam", drugClass: "Benzodiacepina" },
  { name: "alprazolam", ingredient: "alprazolam", displayName: "Alprazolam", drugClass: "Benzodiacepina" },
  { name: "clonazepam", ingredient: "clonazepam", displayName: "Clonazepam", drugClass: "Benzodiacepina" },
  { name: "lorazepam", ingredient: "lorazepam", displayName: "Lorazepam", drugClass: "Benzodiacepina" },
  { name: "morphine", ingredient: "morphine", displayName: "Morfina", drugClass: "Opioide" },
  { name: "morfina", ingredient: "morphine", displayName: "Morfina", drugClass: "Opioide" },
  { name: "hydrocodone", ingredient: "hydrocodone", displayName: "Hidrocodona", drugClass: "Opioide" },
  { name: "oxycodone", ingredient: "oxycodone", displayName: "Oxicodona", drugClass: "Opioide" },
  { name: "codeine", ingredient: "codeine", displayName: "Codeina", drugClass: "Opioide" },
  { name: "simvastatin", ingredient: "simvastatin", displayName: "Simvastatina", drugClass: "Estatina CYP3A4" },
  { name: "simvastatina", ingredient: "simvastatin", displayName: "Simvastatina", drugClass: "Estatina CYP3A4" },
  { name: "lovastatin", ingredient: "lovastatin", displayName: "Lovastatina", drugClass: "Estatina CYP3A4" },
  { name: "atorvastatin", ingredient: "atorvastatin", displayName: "Atorvastatina", drugClass: "Estatina CYP3A4" },
  { name: "clarithromycin", ingredient: "clarithromycin", displayName: "Claritromicina", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "claritromicina", ingredient: "clarithromycin", displayName: "Claritromicina", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "erythromycin", ingredient: "erythromycin", displayName: "Eritromicina", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "ketoconazole", ingredient: "ketoconazole", displayName: "Ketoconazol", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "itraconazole", ingredient: "itraconazole", displayName: "Itraconazol", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "methotrexate", ingredient: "methotrexate", displayName: "Metotrexato", drugClass: "Metotrexato" },
  { name: "metotrexato", ingredient: "methotrexate", displayName: "Metotrexato", drugClass: "Metotrexato" },
  { name: "trimethoprim", ingredient: "trimethoprim", displayName: "Trimetoprima", drugClass: "Antibiotico antifolato" },
  { name: "sulfamethoxazole", ingredient: "sulfamethoxazole", displayName: "Sulfametoxazol", drugClass: "Antibiotico antifolato" }
];

/** Fuentes con licencia declarada para el manifest (compuerta legal paso 25). */
export const SOURCES = [
  {
    name: "ONChigh",
    license: "Public Domain (ONC/RAND, licencia mundial irrevocable al gobierno de EE. UU.)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3422823/"
  },
  {
    name: "RxNorm/RxClass",
    license: "Public Domain (U.S. National Library of Medicine)",
    url: "https://www.nlm.nih.gov/research/umls/rxnorm/"
  },
  {
    name: "openFDA",
    license: "Public Domain (U.S. Government)",
    url: "https://open.fda.gov/"
  }
];
