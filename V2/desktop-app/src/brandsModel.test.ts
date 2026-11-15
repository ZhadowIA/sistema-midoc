import assert from "node:assert/strict";
import test from "node:test";
import { brandSummary } from "./brandsModel.ts";

test("resume la marca con sus principios activos", () => {
  assert.equal(
    brandSummary({
      display: "Fictimed",
      ingredients: [
        { id: "paracetamol", display: "Paracetamol" },
        { id: "cafeina", display: "Cafeína" }
      ]
    }),
    "Fictimed → Paracetamol + Cafeína"
  );
  assert.equal(brandSummary({ display: "Vacía", ingredients: [] }), "Vacía → sin principios activos");
});
