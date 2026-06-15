import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DDINTER_BASE_URL = "https://ddinter.scbdd.com/static/media/download"
DDINTER_CODES = ["A", "B", "D", "H", "L", "P", "R", "V"]
OPENFDA_URL = "https://api.fda.gov/drug/label.json"
RXNORM_RXCUI_URL = "https://rxnav.nlm.nih.gov/REST/rxcui.json"


CURATED_DRUGS = [
    {"generic": "acetaminophen", "display": "Paracetamol", "class": "Analgesico", "aliases": ["paracetamol", "acetaminofen", "tylenol", "tempra"]},
    {"generic": "ibuprofen", "display": "Ibuprofeno", "class": "AINE", "aliases": ["ibuprofeno", "advil", "motrin"]},
    {"generic": "naproxen", "display": "Naproxeno", "class": "AINE", "aliases": ["naproxeno", "aleve"]},
    {"generic": "aspirin", "display": "Aspirina", "class": "AINE", "aliases": ["aspirina", "acido acetilsalicilico"]},
    {"generic": "ketorolac", "display": "Ketorolaco", "class": "AINE", "aliases": ["ketorolaco"]},
    {"generic": "diclofenac", "display": "Diclofenaco", "class": "AINE", "aliases": ["diclofenaco"]},
    {"generic": "celecoxib", "display": "Celecoxib", "class": "AINE COX-2", "aliases": ["celebrex"]},
    {"generic": "warfarin", "display": "Warfarina", "class": "Anticoagulante", "aliases": ["warfarina", "coumadin", "jantoven"]},
    {"generic": "apixaban", "display": "Apixaban", "class": "Anticoagulante", "aliases": ["eliquis"]},
    {"generic": "rivaroxaban", "display": "Rivaroxaban", "class": "Anticoagulante", "aliases": ["xarelto"]},
    {"generic": "dabigatran", "display": "Dabigatran", "class": "Anticoagulante", "aliases": ["pradaxa"]},
    {"generic": "clopidogrel", "display": "Clopidogrel", "class": "Antiagregante", "aliases": ["plavix"]},
    {"generic": "lisinopril", "display": "Lisinopril", "class": "IECA", "aliases": ["prinivil", "zestril"]},
    {"generic": "enalapril", "display": "Enalapril", "class": "IECA", "aliases": ["vasotec"]},
    {"generic": "losartan", "display": "Losartan", "class": "ARA II", "aliases": ["cozaar"]},
    {"generic": "valsartan", "display": "Valsartan", "class": "ARA II", "aliases": ["diovan"]},
    {"generic": "spironolactone", "display": "Espironolactona", "class": "Diuretico ahorrador de potasio", "aliases": ["espironolactona", "aldactone"]},
    {"generic": "hydrochlorothiazide", "display": "Hidroclorotiazida", "class": "Diuretico tiazidico", "aliases": ["hidroclorotiazida"]},
    {"generic": "furosemide", "display": "Furosemida", "class": "Diuretico de asa", "aliases": ["furosemida", "lasix"]},
    {"generic": "metoprolol", "display": "Metoprolol", "class": "Betabloqueador", "aliases": ["lopressor", "toprol"]},
    {"generic": "propranolol", "display": "Propranolol", "class": "Betabloqueador", "aliases": ["inderal"]},
    {"generic": "amlodipine", "display": "Amlodipino", "class": "Calcioantagonista", "aliases": ["amlodipino", "norvasc"]},
    {"generic": "verapamil", "display": "Verapamilo", "class": "Calcioantagonista", "aliases": ["verapamilo", "calan", "verelan"]},
    {"generic": "sildenafil", "display": "Sildenafil", "class": "Inhibidor PDE5", "aliases": ["viagra"]},
    {"generic": "tadalafil", "display": "Tadalafil", "class": "Inhibidor PDE5", "aliases": ["cialis"]},
    {"generic": "nitroglycerin", "display": "Nitroglicerina", "class": "Nitrato", "aliases": ["nitroglicerina"]},
    {"generic": "isosorbide dinitrate", "display": "Dinitrato de isosorbida", "class": "Nitrato", "aliases": ["isosorbida"]},
    {"generic": "atorvastatin", "display": "Atorvastatina", "class": "Estatina", "aliases": ["atorvastatina", "lipitor"]},
    {"generic": "simvastatin", "display": "Simvastatina", "class": "Estatina", "aliases": ["simvastatina", "zocor"]},
    {"generic": "rosuvastatin", "display": "Rosuvastatina", "class": "Estatina", "aliases": ["rosuvastatina", "crestor"]},
    {"generic": "clarithromycin", "display": "Claritromicina", "class": "Macrolido", "aliases": ["claritromicina", "biaxin"]},
    {"generic": "azithromycin", "display": "Azitromicina", "class": "Macrolido", "aliases": ["azitromicina", "zithromax"]},
    {"generic": "erythromycin", "display": "Eritromicina", "class": "Macrolido", "aliases": ["eritromicina"]},
    {"generic": "amoxicillin", "display": "Amoxicilina", "class": "Penicilina", "aliases": ["amoxicilina", "amoxil"]},
    {"generic": "ampicillin", "display": "Ampicilina", "class": "Penicilina", "aliases": ["ampicilina"]},
    {"generic": "cephalexin", "display": "Cefalexina", "class": "Cefalosporina", "aliases": ["cefalexina", "keflex"]},
    {"generic": "ciprofloxacin", "display": "Ciprofloxacino", "class": "Fluoroquinolona", "aliases": ["ciprofloxacino", "cipro"]},
    {"generic": "levofloxacin", "display": "Levofloxacino", "class": "Fluoroquinolona", "aliases": ["levofloxacino", "levaquin"]},
    {"generic": "metronidazole", "display": "Metronidazol", "class": "Nitroimidazol", "aliases": ["metronidazol", "flagyl"]},
    {"generic": "trimethoprim", "display": "Trimetoprim", "class": "Antifolato", "aliases": ["trimetoprim"]},
    {"generic": "sulfamethoxazole", "display": "Sulfametoxazol", "class": "Sulfonamida", "aliases": ["sulfametoxazol"]},
    {"generic": "fluconazole", "display": "Fluconazol", "class": "Azol antifungico", "aliases": ["fluconazol", "diflucan"]},
    {"generic": "tramadol", "display": "Tramadol", "class": "Opioide", "aliases": ["ultram"]},
    {"generic": "morphine", "display": "Morfina", "class": "Opioide", "aliases": ["morfina"]},
    {"generic": "oxycodone", "display": "Oxicodona", "class": "Opioide", "aliases": ["oxicodona", "oxycontin"]},
    {"generic": "fluoxetine", "display": "Fluoxetina", "class": "ISRS", "aliases": ["fluoxetina", "prozac"]},
    {"generic": "sertraline", "display": "Sertralina", "class": "ISRS", "aliases": ["zoloft"]},
    {"generic": "escitalopram", "display": "Escitalopram", "class": "ISRS", "aliases": ["lexapro"]},
    {"generic": "citalopram", "display": "Citalopram", "class": "ISRS", "aliases": ["celexa"]},
    {"generic": "venlafaxine", "display": "Venlafaxina", "class": "IRSN", "aliases": ["venlafaxina", "effexor"]},
    {"generic": "lithium", "display": "Litio", "class": "Estabilizador del animo", "aliases": ["litio"]},
    {"generic": "carbamazepine", "display": "Carbamazepina", "class": "Anticonvulsivo", "aliases": ["carbamazepina", "tegretol"]},
    {"generic": "phenytoin", "display": "Fenitoina", "class": "Anticonvulsivo", "aliases": ["fenitoina", "dilantin"]},
    {"generic": "metformin", "display": "Metformina", "class": "Biguanida", "aliases": ["metformina", "glucophage"]},
    {"generic": "glipizide", "display": "Glipizida", "class": "Sulfonilurea", "aliases": ["glipizida", "glucotrol"]},
    {"generic": "glyburide", "display": "Gliburida", "class": "Sulfonilurea", "aliases": ["glibenclamida", "gliburida"]},
    {"generic": "insulin", "display": "Insulina", "class": "Insulina", "aliases": ["insulina"]},
    {"generic": "levothyroxine", "display": "Levotiroxina", "class": "Hormona tiroidea", "aliases": ["levotiroxina", "synthroid", "eutirox"]},
    {"generic": "omeprazole", "display": "Omeprazol", "class": "IBP", "aliases": ["omeprazol", "prilosec"]},
    {"generic": "pantoprazole", "display": "Pantoprazol", "class": "IBP", "aliases": ["pantoprazol", "protonix"]},
    {"generic": "prednisone", "display": "Prednisona", "class": "Corticoide", "aliases": ["prednisona"]},
    {"generic": "albuterol", "display": "Salbutamol", "class": "Beta-2 agonista", "aliases": ["salbutamol", "ventolin", "proair"]},
    {"generic": "montelukast", "display": "Montelukast", "class": "Antileucotrieno", "aliases": ["singulair"]},
    {"generic": "loratadine", "display": "Loratadina", "class": "Antihistaminico", "aliases": ["loratadina", "claritin"]},
    {"generic": "cetirizine", "display": "Cetirizina", "class": "Antihistaminico", "aliases": ["cetirizina", "zyrtec"]},
]


def csv_key(value: str) -> str:
    return " ".join(value.strip().lower().split())


def medication_rows_for(drug):
    names = [drug["generic"], *drug.get("aliases", [])]
    seen = set()
    rows = []
    for name in names:
        key = csv_key(name)
        if not key or key in seen:
            continue
        seen.add(key)
        rows.append([key, csv_key(drug["generic"]), drug["display"], drug["class"]])
    return rows


def filter_ddinter_rows(source_rows, curated_generics):
    kept = []
    seen = set()
    for row in source_rows:
        if not row or row[0] == "DDInterID_A":
            continue
        if len(row) < 5:
            continue
        drug_a = csv_key(row[1])
        drug_b = csv_key(row[3])
        if drug_a not in curated_generics or drug_b not in curated_generics or drug_a == drug_b:
            continue
        pair_key = tuple(sorted((drug_a, drug_b)))
        if pair_key in seen:
            continue
        seen.add(pair_key)
        kept.append([row[0], row[1].strip(), row[2], row[3].strip(), row[4].strip()])
    return kept


def fetch_text(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "MiDoc-reference-builder/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8-sig")


def read_csv_from_url(url: str):
    text = fetch_text(url)
    return list(csv.reader(text.splitlines()))


def ddinter_rows():
    rows = [["DDInterID_A", "Drug_A", "DDInterID_B", "Drug_B", "Level"]]
    for code in DDINTER_CODES:
        url = f"{DDINTER_BASE_URL}/ddinter_downloads_code_{code}.csv"
        rows.extend(read_csv_from_url(url))
    return rows


def openfda_label_for(generic: str):
    query = f'openfda.generic_name:"{generic}" AND _exists_:drug_interactions'
    params = urllib.parse.urlencode({"search": query, "limit": 1})
    url = f"{OPENFDA_URL}?{params}"
    try:
        payload = json.loads(fetch_text(url, timeout=30))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    results = payload.get("results") or []
    if not results:
        return None
    interactions = results[0].get("drug_interactions") or []
    text = " ".join(part.strip() for part in interactions if isinstance(part, str) and part.strip())
    if not text:
        return None
    return {
        "openfda": {"generic_name": [generic]},
        "drug_interactions": [text],
    }


def rxnorm_rxcui_for(generic: str):
    params = urllib.parse.urlencode({"name": generic, "search": 2})
    url = f"{RXNORM_RXCUI_URL}?{params}"
    payload = json.loads(fetch_text(url, timeout=30))
    ids = (payload.get("idGroup") or {}).get("rxnormId") or []
    return ids[0] if ids else None


def validate_rxnorm_generics(drugs):
    validated = {}
    missing = []
    for drug in drugs:
        generic = csv_key(drug["generic"])
        rxcui = rxnorm_rxcui_for(generic)
        if rxcui:
            validated[generic] = rxcui
        else:
            missing.append(generic)
    if missing:
        raise RuntimeError(f"RxNorm no resolvio estos ingredientes: {', '.join(missing)}")
    return validated


def write_csv(path: Path, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerows(rows)


def build(output_dir: Path, skip_openfda: bool = False):
    output_dir.mkdir(parents=True, exist_ok=True)
    rxnorm_ids = validate_rxnorm_generics(CURATED_DRUGS)

    medication_rows = [["name", "ingredient", "display_name", "drug_class"]]
    for drug in CURATED_DRUGS:
        medication_rows.extend(medication_rows_for(drug))

    curated_generics = {csv_key(drug["generic"]) for drug in CURATED_DRUGS}
    interactions = [["DDInterID_A", "Drug_A", "DDInterID_B", "Drug_B", "Level"]]
    interactions.extend(filter_ddinter_rows(ddinter_rows(), curated_generics))

    labels = []
    if not skip_openfda:
        for idx, drug in enumerate(CURATED_DRUGS, start=1):
            label = openfda_label_for(drug["generic"])
            if label:
                labels.append(label)
            if idx % 10 == 0:
                time.sleep(0.2)

    write_csv(output_dir / "medications.csv", medication_rows)
    write_csv(output_dir / "ddinter.csv", interactions)
    (output_dir / "openfda.json").write_text(
        json.dumps({"results": labels}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output_dir / "manifest.json").write_text(
        json.dumps(
            {
                "version": "midoc-real-2026-06-14",
                "sources": {
                    "rxnorm": RXNORM_RXCUI_URL,
                    "ddinter": DDINTER_BASE_URL,
                    "openfda": OPENFDA_URL,
                },
                "counts": {
                    "medicationRows": len(medication_rows) - 1,
                    "interactionRows": len(interactions) - 1,
                    "labelRows": len(labels),
                    "rxnormValidatedIngredients": len(rxnorm_ids),
                },
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return {
        "medications": len(medication_rows) - 1,
        "interactions": len(interactions) - 1,
        "labels": len(labels),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build MiDoc medication reference data.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "desktop-app" / "src-tauri" / "src" / "reference_data",
    )
    parser.add_argument("--skip-openfda", action="store_true")
    args = parser.parse_args(argv)
    counts = build(args.output, skip_openfda=args.skip_openfda)
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
