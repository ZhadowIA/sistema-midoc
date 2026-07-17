import assert from "node:assert/strict";
import { test } from "node:test";
import { CROWN_PATHS, crownRegionPaths, GROOVE_PATHS, ROOT_PATHS } from "./toothGeometry.ts";
import { toothProportions, type ToothType } from "./odontogramModel.ts";

const TYPES: ToothType[] = ["MOLAR", "PREMOLAR", "CANINE", "INCISOR"];

test("cada tipo define sus 5 regiones y su silueta", () => {
  for (const type of TYPES) {
    const regions = crownRegionPaths(type);
    for (const slot of ["center", "top", "right", "bottom", "left"] as const) {
      assert.match(regions[slot], /^M[\d .]/, `${type} ${slot}`);
      assert.match(regions[slot], /Z$/, `${type} ${slot} cerrada`);
    }
    assert.ok(CROWN_PATHS[type].length > 0);
    assert.ok(GROOVE_PATHS[type].length > 0);
  }
  assert.ok(ROOT_PATHS.SINGLE.length > 0 && ROOT_PATHS.DOUBLE.length > 0);
});

test("el teselado es por construccion: cada borde de la tabla se comparte", () => {
  for (const type of TYPES) {
    const regions = crownRegionPaths(type);
    // Cada region periferica contiene el mismo segmento cuadratico (control +
    // extremo) que la tabla central usa para ese borde: mismos numeros,
    // ninguna coordenada inventada.
    const quadSegments = regions.center.match(/Q[\d. ]+/g) ?? [];
    assert.equal(quadSegments.length, 4, `${type}: la tabla tiene 4 bordes curvos`);
    const [topSeg, rightSeg, bottomSeg, leftSeg] = quadSegments;
    assert.ok(regions.top.includes(topSeg.trim().split(" ").slice(0, 2).join(" ").slice(1)), `${type} top comparte control`);
    assert.ok(regions.right.includes(rightSeg.trim().split(" ").slice(0, 2).join(" ").slice(1)), `${type} right comparte control`);
    assert.ok(regions.bottom.includes(bottomSeg.trim().split(" ").slice(0, 2).join(" ").slice(1)), `${type} bottom comparte control`);
    assert.ok(regions.left.includes(leftSeg.trim().split(" ").slice(0, 2).join(" ").slice(1)), `${type} left comparte control`);
  }
});

test("la tabla central es distinta por tipo (molar amplia, incisivo banda)", () => {
  const centers = new Set(TYPES.map((type) => crownRegionPaths(type).center));
  assert.equal(centers.size, TYPES.length);
  // El incisivo es mas ancho que alto (banda incisal); el molar es cuadrado.
  assert.ok(crownRegionPaths("INCISOR").center.startsWith("M9 17"));
  assert.ok(crownRegionPaths("MOLAR").center.startsWith("M13 14"));
});

test("proporciones por pieza: jerarquia anatomica de anchos", () => {
  const w = (id: string) => toothProportions(id).width;
  // Molares: primero > segundo > tercero, y son los mas anchos.
  assert.ok(w("16") > w("17") && w("17") > w("18"));
  // Central superior > lateral superior > incisivos inferiores (los mas angostos).
  assert.ok(w("11") > w("12") && w("12") > w("31"));
  // Canino mas alto que un incisivo.
  assert.ok(toothProportions("13").height > toothProportions("11").height);
  // Temporales mas chicos que su contraparte permanente.
  assert.ok(w("55") < w("16"));
  assert.ok(w("51") < w("11"));
  // Todo dentro de un rango razonable para el layout.
  for (const id of ["11", "12", "13", "14", "16", "18", "31", "36", "51", "55", "85"]) {
    const p = toothProportions(id);
    assert.ok(p.width >= 0.5 && p.width <= 1, `${id} width ${p.width}`);
    assert.ok(p.height >= 0.85 && p.height <= 1.1, `${id} height ${p.height}`);
  }
});
