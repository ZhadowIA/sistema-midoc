import unittest

from generate_reference_data import (
    csv_key,
    filter_ddinter_rows,
    medication_rows_for,
)


class ReferenceDataGeneratorTests(unittest.TestCase):
    def test_medication_rows_include_curated_aliases_only(self):
        drug = {
            "generic": "acetaminophen",
            "display": "Paracetamol",
            "class": "Analgesico",
            "aliases": ["paracetamol", "acetaminofen", "Tylenol"],
        }

        rows = medication_rows_for(drug)

        self.assertEqual(
            rows,
            [
                ["acetaminophen", "acetaminophen", "Paracetamol", "Analgesico"],
                ["paracetamol", "acetaminophen", "Paracetamol", "Analgesico"],
                ["acetaminofen", "acetaminophen", "Paracetamol", "Analgesico"],
                ["tylenol", "acetaminophen", "Paracetamol", "Analgesico"],
            ],
        )

    def test_filter_ddinter_rows_keeps_only_curated_pairs(self):
        source = [
            ["DDInterID_A", "Drug_A", "DDInterID_B", "Drug_B", "Level"],
            ["DDInter1", "Ibuprofen", "DDInter2", "Warfarin", "Major"],
            ["DDInter3", "Ibuprofen", "DDInter4", "Unknown Drug", "Minor"],
        ]

        rows = filter_ddinter_rows(source, {"ibuprofen", "warfarin"})

        self.assertEqual(
            rows,
            [["DDInter1", "Ibuprofen", "DDInter2", "Warfarin", "Major"]],
        )

    def test_csv_key_normalizes_for_midoc_lookup(self):
        self.assertEqual(csv_key(" Acetaminophen  / Paracetamol "), "acetaminophen / paracetamol")


if __name__ == "__main__":
    unittest.main()
