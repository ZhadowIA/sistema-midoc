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

import { resolveBrands, type BrandAlias, type ClassMembers, type ClassRule, type MedicationRow, type TripleRule } from "./reference.ts";

/**
 * Miembros por clase terapeutica (subconjunto). En la version completa este
 * mapa se deriva de RxClass (ATC/MoA) por el pipeline; aqui se curó a mano el
 * nucleo relevante para consultorio de primer nivel en Mexico.
 * TODO(onchigh-full): reemplazar por extraccion reproducible desde RxClass.
 */
export const CLASS_MEMBERS: ClassMembers = {
  Anticoagulante: ["warfarin", "acenocoumarol"],
  // Aspirina NO va aqui: para CDS por ingrediente puro generaba falsos positivos
  // (p. ej. metotrexato + aspirina 81-100 mg). El sangrado con anticoagulante ya
  // lo cubre Antiplaquetario. Si en el futuro se maneja dosis, aspirina >=500 mg/dia
  // podria entrar como AINE. Decision clinica del medico (2026-07-07).
  AINE: ["ibuprofen", "naproxen", "diclofenac", "ketorolac", "meloxicam"],
  Antiplaquetario: ["aspirin", "clopidogrel"],
  IECA: ["enalapril", "lisinopril", "captopril", "ramipril"],
  ARA2: ["losartan", "valsartan", "telmisartan"],
  "Ahorrador de potasio": ["spironolactone", "amiloride", "eplerenone"],
  "Suplemento de potasio": ["potassium chloride"],
  Nitrato: ["nitroglycerin", "isosorbide dinitrate", "isosorbide mononitrate"],
  "Inhibidor PDE5": ["sildenafil", "tadalafil", "vardenafil"],
  IMAO: ["phenelzine", "tranylcypromine", "linezolid", "selegiline"],
  // Fluvoxamina es ISRS (interactua con IMAO) y ademas inhibidor CYP1A2 (regla
  // con tizanidina): aparece en ambas clases; la expansion lo maneja sin problema.
  ISRS: ["fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram", "fluvoxamine"],
  IRSN: ["venlafaxine", "duloxetine"],
  "Opioide serotoninergico": ["tramadol", "fentanyl", "meperidine"],
  Benzodiacepina: ["diazepam", "alprazolam", "clonazepam", "lorazepam"],
  Opioide: ["morphine", "hydrocodone", "oxycodone", "codeine", "tramadol"],
  // Estatinas divididas por criterio clinico: simva/lova tienen contraindicacion
  // formal con inhibidores fuertes CYP3A4; atorvastatina es riesgo aumentado
  // (se maneja con suspension/reduccion/cambio), no contraindicacion dura.
  "Estatina CYP3A4 alto riesgo": ["simvastatin", "lovastatin"],
  "Estatina CYP3A4 riesgo moderado": ["atorvastatin"],
  "Inhibidor fuerte CYP3A4": ["clarithromycin", "erythromycin", "ketoconazole", "itraconazole"],
  Metotrexato: ["methotrexate"],
  "Antibiotico antifolato": ["trimethoprim", "sulfamethoxazole"],
  "Inhibidor xantina oxidasa": ["allopurinol", "febuxostat"],
  Tiopurina: ["azathioprine", "mercaptopurine"],
  Diuretico: ["hydrochlorothiazide", "furosemide", "bumetanide", "torsemide", "chlorthalidone"],
  // --- Apendice ONChigh completado (sin QT, diferido a rebanada dedicada) ---
  // Ergotaminicos vasoconstrictores (migrana): con inhibidor fuerte CYP3A4 dan
  // ergotismo/vasoespasmo por acumulacion. Muy usados en Mexico (Cafergot).
  "Ergotaminico": ["ergotamine", "dihydroergotamine"],
  // Inhibidores de CYP1A2 relevantes en primer nivel: ciprofloxacino (antibiotico
  // frecuente) y fluvoxamina. Elevan de forma marcada la tizanidina.
  "Inhibidor CYP1A2": ["ciprofloxacin", "fluvoxamine"],
  Tizanidina: ["tizanidine"],
  Triptan: ["sumatriptan", "rizatriptan", "zolmitriptan", "naratriptan", "eletriptan"],
  "Antidepresivo triciclico": ["amitriptyline", "imipramine", "clomipramine", "nortriptyline"]
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
    description: "Sindrome serotoninergico. Evitar; si el IMAO (p. ej. linezolid) es imprescindible, suspender el serotoninergico, valorar periodo de lavado y monitorizar estrechamente."
  },
  {
    classA: "IMAO",
    classB: "IRSN",
    severity: "CONTRAINDICATED",
    description: "Sindrome serotoninergico. Evitar; si el IMAO (p. ej. linezolid) es imprescindible, suspender el serotoninergico, valorar periodo de lavado y monitorizar estrechamente."
  },
  {
    classA: "IMAO",
    classB: "Opioide serotoninergico",
    severity: "CONTRAINDICATED",
    description: "Sindrome serotoninergico o toxicidad opioide. Evitar; si el IMAO (p. ej. linezolid) es imprescindible, suspender el serotoninergico y monitorizar estrechamente."
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
    classA: "Estatina CYP3A4 alto riesgo",
    classB: "Inhibidor fuerte CYP3A4",
    severity: "CONTRAINDICATED",
    description: "Miopatia/rabdomiolisis por aumento marcado de la estatina: simvastatina/lovastatina estan contraindicadas con inhibidores fuertes de CYP3A4."
  },
  {
    classA: "Estatina CYP3A4 riesgo moderado",
    classB: "Inhibidor fuerte CYP3A4",
    severity: "MAJOR",
    description: "Riesgo aumentado de miopatia/rabdomiolisis: considerar suspender, reducir dosis o cambiar la estatina durante el tratamiento con el inhibidor."
  },
  {
    classA: "Metotrexato",
    classB: "Antibiotico antifolato",
    severity: "MAJOR",
    description: "Evitar combinacion. Riesgo de pancitopenia, mucositis, nefrotoxicidad y toxicidad grave por metotrexato por efecto antifolato sumado."
  },
  {
    classA: "Metotrexato",
    classB: "AINE",
    severity: "MAJOR",
    description: "Aumento de la toxicidad por metotrexato (mielosupresion, dano renal) por reduccion de la eliminacion renal, sobre todo con dosis altas o deterioro renal."
  },
  {
    classA: "IECA",
    classB: "AINE",
    severity: "MAJOR",
    description: "Deterioro de la funcion renal, hiperpotasemia y menor efecto antihipertensivo. Vigilar funcion renal y potasio; evitar en riesgo renal."
  },
  {
    classA: "ARA2",
    classB: "AINE",
    severity: "MAJOR",
    description: "Deterioro de la funcion renal, hiperpotasemia y menor efecto antihipertensivo. Vigilar funcion renal y potasio; evitar en riesgo renal."
  },
  {
    classA: "Inhibidor xantina oxidasa",
    classB: "Tiopurina",
    severity: "CONTRAINDICATED",
    description: "Toxicidad grave por tiopurinas (mielosupresion): la inhibicion de xantina oxidasa bloquea su metabolismo. Evitar o reduccion extrema supervisada."
  },
  // --- Apendice ONChigh completado (Phansalkar JAMIA 2012, PMC3422823). Las 4
  // reglas siguientes cierran las DDIs de alta prioridad relevantes a primer
  // nivel en Mexico que faltaban. QT+QT (ONChigh #8) se difiere a una rebanada
  // dedicada con lista QT curada (evita fatiga de alertas). ---
  {
    classA: "Ergotaminico",
    classB: "Inhibidor fuerte CYP3A4",
    severity: "CONTRAINDICATED",
    description: "Ergotismo (vasoespasmo, isquemia) por acumulacion del ergotaminico: los inhibidores fuertes de CYP3A4 bloquean su metabolismo. Combinacion contraindicada."
  },
  {
    classA: "Tizanidina",
    classB: "Inhibidor CYP1A2",
    severity: "CONTRAINDICATED",
    description: "Hipotension grave, somnolencia y bradicardia por aumento marcado de tizanidina: ciprofloxacino y fluvoxamina inhiben CYP1A2. Combinacion contraindicada."
  },
  {
    classA: "Triptan",
    classB: "IMAO",
    severity: "MAJOR",
    description: "Riesgo de sindrome serotoninergico por efecto serotoninergico sumado. Evitar; separar del IMAO segun el triptan y valorar alternativa."
  },
  {
    classA: "Antidepresivo triciclico",
    classB: "IMAO",
    severity: "CONTRAINDICATED",
    description: "Crisis hipertensiva y sindrome serotoninergico por potenciacion adrenergica/serotoninergica. Evitar; respetar periodo de lavado al cambiar entre ellos."
  }
];

/**
 * Reglas de interaccion de TRES clases. El "triple whammy" (IECA/ARA2 +
 * diuretico + AINE) causa lesion renal aguda por el efecto combinado sobre la
 * perfusion renal. Se modela como dos reglas (IECA y ARA2) porque la pierna
 * "IECA/ARA2" es "cualquiera de las dos". Severidad MAJOR: debe interrumpir y
 * pedir juicio clinico (a veces se usa pocos dias). Decision clinica 2026-07-07.
 */
export const TRIPLE_RULES: TripleRule[] = [
  {
    classA: "IECA",
    classB: "Diuretico",
    classC: "AINE",
    severity: "MAJOR",
    description: "Triple whammy: IECA + diuretico + AINE eleva el riesgo de lesion renal aguda. Vigilar funcion renal y potasio; evitar o suspender el AINE."
  },
  {
    classA: "ARA2",
    classB: "Diuretico",
    classC: "AINE",
    severity: "MAJOR",
    description: "Triple whammy: ARA2 + diuretico + AINE eleva el riesgo de lesion renal aguda. Vigilar funcion renal y potasio; evitar o suspender el AINE."
  }
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
  { name: "simvastatin", ingredient: "simvastatin", displayName: "Simvastatina", drugClass: "Estatina CYP3A4 alto riesgo" },
  { name: "simvastatina", ingredient: "simvastatin", displayName: "Simvastatina", drugClass: "Estatina CYP3A4 alto riesgo" },
  { name: "lovastatin", ingredient: "lovastatin", displayName: "Lovastatina", drugClass: "Estatina CYP3A4 alto riesgo" },
  { name: "atorvastatin", ingredient: "atorvastatin", displayName: "Atorvastatina", drugClass: "Estatina CYP3A4 riesgo moderado" },
  { name: "clarithromycin", ingredient: "clarithromycin", displayName: "Claritromicina", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "claritromicina", ingredient: "clarithromycin", displayName: "Claritromicina", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "erythromycin", ingredient: "erythromycin", displayName: "Eritromicina", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "ketoconazole", ingredient: "ketoconazole", displayName: "Ketoconazol", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "itraconazole", ingredient: "itraconazole", displayName: "Itraconazol", drugClass: "Inhibidor fuerte CYP3A4" },
  { name: "methotrexate", ingredient: "methotrexate", displayName: "Metotrexato", drugClass: "Metotrexato" },
  { name: "metotrexato", ingredient: "methotrexate", displayName: "Metotrexato", drugClass: "Metotrexato" },
  { name: "trimethoprim", ingredient: "trimethoprim", displayName: "Trimetoprima", drugClass: "Antibiotico antifolato" },
  { name: "sulfamethoxazole", ingredient: "sulfamethoxazole", displayName: "Sulfametoxazol", drugClass: "Antibiotico antifolato" },
  { name: "allopurinol", ingredient: "allopurinol", displayName: "Alopurinol", drugClass: "Inhibidor xantina oxidasa" },
  { name: "alopurinol", ingredient: "allopurinol", displayName: "Alopurinol", drugClass: "Inhibidor xantina oxidasa" },
  { name: "febuxostat", ingredient: "febuxostat", displayName: "Febuxostat", drugClass: "Inhibidor xantina oxidasa" },
  { name: "azathioprine", ingredient: "azathioprine", displayName: "Azatioprina", drugClass: "Tiopurina" },
  { name: "azatioprina", ingredient: "azathioprine", displayName: "Azatioprina", drugClass: "Tiopurina" },
  { name: "mercaptopurine", ingredient: "mercaptopurine", displayName: "Mercaptopurina", drugClass: "Tiopurina" },
  { name: "mercaptopurina", ingredient: "mercaptopurine", displayName: "Mercaptopurina", drugClass: "Tiopurina" },
  { name: "6-mercaptopurina", ingredient: "mercaptopurine", displayName: "Mercaptopurina", drugClass: "Tiopurina" },
  { name: "hydrochlorothiazide", ingredient: "hydrochlorothiazide", displayName: "Hidroclorotiazida", drugClass: "Diuretico" },
  { name: "hidroclorotiazida", ingredient: "hydrochlorothiazide", displayName: "Hidroclorotiazida", drugClass: "Diuretico" },
  { name: "furosemide", ingredient: "furosemide", displayName: "Furosemida", drugClass: "Diuretico" },
  { name: "furosemida", ingredient: "furosemide", displayName: "Furosemida", drugClass: "Diuretico" },
  { name: "bumetanide", ingredient: "bumetanide", displayName: "Bumetanida", drugClass: "Diuretico" },
  { name: "bumetanida", ingredient: "bumetanide", displayName: "Bumetanida", drugClass: "Diuretico" },
  { name: "torsemide", ingredient: "torsemide", displayName: "Torasemida", drugClass: "Diuretico" },
  { name: "torasemida", ingredient: "torsemide", displayName: "Torasemida", drugClass: "Diuretico" },
  { name: "chlorthalidone", ingredient: "chlorthalidone", displayName: "Clortalidona", drugClass: "Diuretico" },
  { name: "clortalidona", ingredient: "chlorthalidone", displayName: "Clortalidona", drugClass: "Diuretico" },
  // --- Ingredientes del apendice ONChigh completado. drug_class es la clase
  // TERAPEUTICA natural (para duplicidad/alergia), no la clase de interaccion:
  // p. ej. ciprofloxacino es Fluoroquinolona (evita falsa duplicidad con
  // fluvoxamina, que ambos inhiben CYP1A2 pero no son duplicados terapeuticos). ---
  { name: "ergotamine", ingredient: "ergotamine", displayName: "Ergotamina", drugClass: "Ergotaminico" },
  { name: "ergotamina", ingredient: "ergotamine", displayName: "Ergotamina", drugClass: "Ergotaminico" },
  { name: "dihydroergotamine", ingredient: "dihydroergotamine", displayName: "Dihidroergotamina", drugClass: "Ergotaminico" },
  { name: "dihidroergotamina", ingredient: "dihydroergotamine", displayName: "Dihidroergotamina", drugClass: "Ergotaminico" },
  { name: "tizanidine", ingredient: "tizanidine", displayName: "Tizanidina", drugClass: "Relajante muscular" },
  { name: "tizanidina", ingredient: "tizanidine", displayName: "Tizanidina", drugClass: "Relajante muscular" },
  { name: "ciprofloxacin", ingredient: "ciprofloxacin", displayName: "Ciprofloxacino", drugClass: "Fluoroquinolona" },
  { name: "ciprofloxacino", ingredient: "ciprofloxacin", displayName: "Ciprofloxacino", drugClass: "Fluoroquinolona" },
  { name: "ciprofloxacina", ingredient: "ciprofloxacin", displayName: "Ciprofloxacino", drugClass: "Fluoroquinolona" },
  { name: "fluvoxamine", ingredient: "fluvoxamine", displayName: "Fluvoxamina", drugClass: "ISRS" },
  { name: "fluvoxamina", ingredient: "fluvoxamine", displayName: "Fluvoxamina", drugClass: "ISRS" },
  { name: "sumatriptan", ingredient: "sumatriptan", displayName: "Sumatriptan", drugClass: "Triptan" },
  { name: "rizatriptan", ingredient: "rizatriptan", displayName: "Rizatriptan", drugClass: "Triptan" },
  { name: "zolmitriptan", ingredient: "zolmitriptan", displayName: "Zolmitriptan", drugClass: "Triptan" },
  { name: "naratriptan", ingredient: "naratriptan", displayName: "Naratriptan", drugClass: "Triptan" },
  { name: "eletriptan", ingredient: "eletriptan", displayName: "Eletriptan", drugClass: "Triptan" },
  { name: "amitriptyline", ingredient: "amitriptyline", displayName: "Amitriptilina", drugClass: "Antidepresivo triciclico" },
  { name: "amitriptilina", ingredient: "amitriptyline", displayName: "Amitriptilina", drugClass: "Antidepresivo triciclico" },
  { name: "imipramine", ingredient: "imipramine", displayName: "Imipramina", drugClass: "Antidepresivo triciclico" },
  { name: "imipramina", ingredient: "imipramine", displayName: "Imipramina", drugClass: "Antidepresivo triciclico" },
  { name: "clomipramine", ingredient: "clomipramine", displayName: "Clomipramina", drugClass: "Antidepresivo triciclico" },
  { name: "clomipramina", ingredient: "clomipramine", displayName: "Clomipramina", drugClass: "Antidepresivo triciclico" },
  { name: "nortriptyline", ingredient: "nortriptyline", displayName: "Nortriptilina", drugClass: "Antidepresivo triciclico" },
  { name: "nortriptilina", ingredient: "nortriptyline", displayName: "Nortriptilina", drugClass: "Antidepresivo triciclico" }
];

/**
 * Ingredientes de primer nivel que NO participan en reglas de interaccion pero
 * son de uso diario en Mexico: se incluyen para que se RECONOZCAN (y no salgan
 * como "no reconocido"). El swap a ONChigh los habia dejado fuera. Clase
 * terapeutica para duplicidad/alergia cruzada.
 * TODO(cofepris-full): ampliar con el Cuadro Basico del IMSS completo.
 */
export const ADDITIONAL_INGREDIENTS: MedicationRow[] = [
  { name: "acetaminophen", ingredient: "acetaminophen", displayName: "Paracetamol", drugClass: "Analgesico" },
  { name: "paracetamol", ingredient: "acetaminophen", displayName: "Paracetamol", drugClass: "Analgesico" },
  { name: "acetaminofen", ingredient: "acetaminophen", displayName: "Paracetamol", drugClass: "Analgesico" },
  { name: "omeprazole", ingredient: "omeprazole", displayName: "Omeprazol", drugClass: "IBP" },
  { name: "omeprazol", ingredient: "omeprazole", displayName: "Omeprazol", drugClass: "IBP" },
  { name: "pantoprazole", ingredient: "pantoprazole", displayName: "Pantoprazol", drugClass: "IBP" },
  { name: "pantoprazol", ingredient: "pantoprazole", displayName: "Pantoprazol", drugClass: "IBP" },
  { name: "metformin", ingredient: "metformin", displayName: "Metformina", drugClass: "Biguanida" },
  { name: "metformina", ingredient: "metformin", displayName: "Metformina", drugClass: "Biguanida" },
  { name: "amoxicillin", ingredient: "amoxicillin", displayName: "Amoxicilina", drugClass: "Penicilina" },
  { name: "amoxicilina", ingredient: "amoxicillin", displayName: "Amoxicilina", drugClass: "Penicilina" },
  { name: "ampicilina", ingredient: "ampicillin", displayName: "Ampicilina", drugClass: "Penicilina" },
  { name: "azithromycin", ingredient: "azithromycin", displayName: "Azitromicina", drugClass: "Macrolido" },
  { name: "azitromicina", ingredient: "azithromycin", displayName: "Azitromicina", drugClass: "Macrolido" },
  { name: "loratadine", ingredient: "loratadine", displayName: "Loratadina", drugClass: "Antihistaminico" },
  { name: "loratadina", ingredient: "loratadine", displayName: "Loratadina", drugClass: "Antihistaminico" }
];

/**
 * Capa de marcas comerciales mexicanas (paso 25, rebanada 4). Cada marca -> su
 * principio activo (vocabulario RxNorm). Verificadas contra multiples fuentes:
 * PLM (medicamentosplm.com), Vademecum, el Listado de Medicamentos de Referencia
 * de COFEPRIS (gob.mx) y el Cuadro Basico del IMSS. Se prioriza a los principios
 * activos que participan en reglas de interaccion: una marca sin mapear seria un
 * fallo silencioso de reconocimiento (no verifica lo que no conoce).
 * TODO(cofepris-full): completar desde el registro sanitario de COFEPRIS.
 */
export const MEXICAN_BRANDS: BrandAlias[] = [
  // Anticoagulantes
  { brand: "coumadin", ingredient: "warfarin" },
  { brand: "sintrom", ingredient: "acenocoumarol" },
  // AINE
  { brand: "advil", ingredient: "ibuprofen" },
  { brand: "motrin", ingredient: "ibuprofen" },
  { brand: "actron", ingredient: "ibuprofen" },
  { brand: "flanax", ingredient: "naproxen" },
  { brand: "naxen", ingredient: "naproxen" },
  { brand: "dolac", ingredient: "ketorolac" },
  { brand: "supradol", ingredient: "ketorolac" },
  { brand: "voltaren", ingredient: "diclofenac" },
  { brand: "mobic", ingredient: "meloxicam" },
  // Antiplaquetarios
  { brand: "aspirina protect", ingredient: "aspirin" },
  { brand: "plavix", ingredient: "clopidogrel" },
  // IECA / ARA2
  { brand: "renitec", ingredient: "enalapril" },
  { brand: "cozaar", ingredient: "losartan" },
  { brand: "micardis", ingredient: "telmisartan" },
  { brand: "diovan", ingredient: "valsartan" },
  // Diureticos
  { brand: "lasix", ingredient: "furosemide" },
  { brand: "aldactone", ingredient: "spironolactone" },
  // Inhibidores PDE5
  { brand: "viagra", ingredient: "sildenafil" },
  { brand: "cialis", ingredient: "tadalafil" },
  { brand: "levitra", ingredient: "vardenafil" },
  // ISRS / IRSN
  { brand: "prozac", ingredient: "fluoxetine" },
  { brand: "altruline", ingredient: "sertraline" },
  { brand: "paxil", ingredient: "paroxetine" },
  { brand: "efexor", ingredient: "venlafaxine" },
  { brand: "cymbalta", ingredient: "duloxetine" },
  // Opioides serotoninergicos
  { brand: "tradol", ingredient: "tramadol" },
  { brand: "tramal", ingredient: "tramadol" },
  // Benzodiacepinas
  { brand: "tafil", ingredient: "alprazolam" },
  { brand: "neupax", ingredient: "alprazolam" },
  { brand: "rivotril", ingredient: "clonazepam" },
  { brand: "valium", ingredient: "diazepam" },
  { brand: "ativan", ingredient: "lorazepam" },
  // Estatinas
  { brand: "zocor", ingredient: "simvastatin" },
  { brand: "lipitor", ingredient: "atorvastatin" },
  // Inhibidores fuertes CYP3A4
  { brand: "klaricid", ingredient: "clarithromycin" },
  // Antifolato (Bactrim/Septrin son TMP/SMX; se mapea al componente sulfamida)
  { brand: "bactrim", ingredient: "sulfamethoxazole" },
  { brand: "septrin", ingredient: "sulfamethoxazole" },
  // Inhibidor de xantina oxidasa
  { brand: "zyloprim", ingredient: "allopurinol" },
  // Analgesico / IBP / antidiabetico (reconocimiento)
  { brand: "tempra", ingredient: "acetaminophen" },
  { brand: "tylenol", ingredient: "acetaminophen" },
  { brand: "losec", ingredient: "omeprazole" },
  { brand: "glucophage", ingredient: "metformin" },
  { brand: "amoxil", ingredient: "amoxicillin" },
  // --- Marcas del apendice ONChigh completado (verificadas 2026-07-08 contra
  // Vademecum Mexico / PLM / registros COFEPRIS; ver PR). Solo ingredientes con
  // regla de interaccion. Los triptanes/tricicilicos sin marca MX confirmada
  // (p. ej. zolmitriptan) se reconocen por su generico, no se inventa marca. ---
  { brand: "cafergot", ingredient: "ergotamine" }, // ergotamina + cafeina
  { brand: "sirdalud", ingredient: "tizanidine" },
  { brand: "ciproxina", ingredient: "ciprofloxacin" }, // Bayer, reg. 280M98 SSA
  { brand: "luvox", ingredient: "fluvoxamine" },
  { brand: "imigran", ingredient: "sumatriptan" },
  { brand: "maxalt", ingredient: "rizatriptan" },
  { brand: "anapsique", ingredient: "amitriptyline" }, // Psicofarma, reg. 85953 SSA
  { brand: "anafranil", ingredient: "clomipramine" },
  { brand: "tofranil", ingredient: "imipramine" },
  // --- Ampliacion de cobertura por regla (verificadas 2026-07-08 contra
  // Vademecum Mexico / PLM / registros COFEPRIS). Solo marcas MONO-ingrediente
  // con registro MX; se descartan combinaciones (mapear una marca A+B a un solo
  // ingrediente perderia las interacciones del otro) y farmacos sin marca MX. ---
  // ISRS / IMAO
  { brand: "lexapro", ingredient: "escitalopram" },
  { brand: "jumex", ingredient: "selegiline" },
  { brand: "zyvoxam", ingredient: "linezolid" },
  // Inmunosupresores / antimetabolitos (tiopurinas, metotrexato, xantina oxidasa)
  { brand: "imuran", ingredient: "azathioprine" },
  { brand: "purinethol", ingredient: "mercaptopurine" },
  { brand: "ledertrexate", ingredient: "methotrexate" }, // Pfizer, reg. 56216 SSA
  { brand: "adenuric", ingredient: "febuxostat" }, // Siegfried Rhein, reg. 108M2024
  { brand: "turazive", ingredient: "febuxostat" }, // Eurofarma, reg. 083M2015
  // Inhibidores fuertes CYP3A4 (antimicoticos, macrolido)
  { brand: "nizoral", ingredient: "ketoconazole" }, // PLM reg. 8927
  { brand: "sporanox", ingredient: "itraconazole" },
  { brand: "ilosone", ingredient: "erythromycin" }, // PLM reg. 76409
  // IECA
  { brand: "zestril", ingredient: "lisinopril" },
  { brand: "tritace", ingredient: "ramipril" }, // Sanofi, reg. 040M92 SSA
  // Nitrato / opioides (uso hospitalario, pero se teclean por marca)
  { brand: "isorbid", ingredient: "isosorbide dinitrate" }, // Armstrong
  { brand: "durogesic", ingredient: "fentanyl" }, // Janssen, reg. 064M93 (parche)
  { brand: "demerol", ingredient: "meperidine" }, // Sanofi, reg. 27424
  // Triptanes
  { brand: "relpax", ingredient: "eletriptan" }, // Pfizer, reg. 050M2000 SSA
  { brand: "zomig", ingredient: "zolmitriptan" } // Grunenthal, reg. 356M2000 SSA
];

// Ingredientes con regla que a proposito NO llevan marca (se reconocen por su
// generico). Documentado para que no parezca un olvido:
//   - Combinaciones: amilorida (Moduretic), hidroclorotiazida (casi siempre en
//     combos), trimetoprima (Bactrim ya mapea al componente sulfa), codeina
//     (Tylex CD = codeina+paracetamol). Mapear un combo a un solo ingrediente
//     perderia las interacciones del otro.
//   - No comercializados en Mexico con marca vigente: fenelzina (Nardil),
//     tranilcipromina (Parnate) — los IMAO clasicos no se surten en MX.
//   - Genericos/hospitalarios o marca no vigente: captopril, clortalidona,
//     bumetanida, torasemida, lovastatina, nitroglicerina, mononitrato de
//     isosorbida, morfina, hidrocodona, oxicodona, cloruro de potasio,
//     eplerenona, citalopram, nortriptilina, naratriptan, dihidroergotamina.
// Ampliar aqui conforme se verifique una marca MX mono-ingrediente vigente.

/**
 * Base de medicamentos completa: genericos de interaccion + genericos de
 * reconocimiento + marcas comerciales resueltas. Deduplica por nombre (la
 * primera aparicion manda).
 */
export function assembleMedications(): MedicationRow[] {
  const catalog = [...BASE_MEDICATIONS, ...ADDITIONAL_INGREDIENTS];
  const combined = [...catalog, ...resolveBrands(MEXICAN_BRANDS, catalog)];
  const seen = new Set<string>();
  const rows: MedicationRow[] = [];
  for (const row of combined) {
    const key = row.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

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
    name: "COFEPRIS/PLM (marcas MX)",
    license: "Referencia publica: nombres comerciales verificados contra PLM, Vademecum, Listado de Medicamentos de Referencia (COFEPRIS/gob.mx) y Cuadro Basico del IMSS",
    url: "https://www.gob.mx/cofepris"
  },
  {
    name: "openFDA",
    license: "Public Domain (U.S. Government)",
    url: "https://open.fda.gov/"
  }
];
