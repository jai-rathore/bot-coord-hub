import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySakuraTile,
  contrastRatio,
  encodeSakuraQr,
  isFinderModule,
  planSakuraStacks,
  relativeLuminance,
  SAKURA_QR,
} from "./sakura-qr";

test("meet links encode as a high-redundancy matrix with intact finders", () => {
  const matrix = encodeSakuraQr("https://honeymatcha.io/anubha?meet=1");
  assert.ok(matrix.version >= 2 && matrix.version <= 8);
  assert.equal(matrix.size, matrix.version * 4 + 17);
  assert.equal(matrix.dark[0][0], true);
  assert.equal(matrix.dark[0][matrix.size - 1], true);
  assert.equal(matrix.dark[matrix.size - 1][0], true);
  assert.equal(matrix.reserved[0][0], true);
  assert.equal(isFinderModule(0, 0, matrix.size), true);
  assert.equal(isFinderModule(6, 6, matrix.size), true);
  assert.equal(isFinderModule(8, 8, matrix.size), false);
});

test("module colors stay scanner-dark and scanner-light", () => {
  assert.ok(relativeLuminance(SAKURA_QR.dark) < 0.12);
  assert.ok(relativeLuminance(SAKURA_QR.darkDeep) < relativeLuminance(SAKURA_QR.dark));
  assert.ok(relativeLuminance(SAKURA_QR.darkBlossom) < 0.12);
  assert.ok(relativeLuminance(SAKURA_QR.bark) < 0.12);
  assert.ok(relativeLuminance(SAKURA_QR.barkDeep) < relativeLuminance(SAKURA_QR.bark));
  assert.ok(relativeLuminance(SAKURA_QR.light) > 0.85);
  assert.ok(contrastRatio(SAKURA_QR.dark, SAKURA_QR.light) > 7);
  assert.ok(relativeLuminance(SAKURA_QR.blossomWhite) > 0.85);
  assert.ok(contrastRatio(SAKURA_QR.dark, SAKURA_QR.light) > 7);
  assert.ok(contrastRatio(SAKURA_QR.darkBlossom, SAKURA_QR.blossomWhite) > 7);
  assert.ok(contrastRatio(SAKURA_QR.bark, SAKURA_QR.light) > 7);
});

test("dark modules become trunk, canopy, or grass the way tree.icqr.com does", () => {
  const matrix = encodeSakuraQr("https://honeymatcha.io/jai?meet=1");
  const mid = Math.floor(matrix.size / 2);
  assert.equal(classifySakuraTile(0, 0, matrix.size, true), "finder");
  assert.equal(classifySakuraTile(8, 8, matrix.size, false), "plot");
  const kinds = new Set<string>();
  const stacks = planSakuraStacks(matrix);
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      kinds.add(
        classifySakuraTile(row, col, matrix.size, matrix.dark[row][col]),
      );
    }
  }
  assert.ok(kinds.has("finder"));
  assert.ok(kinds.has("plot"));
  assert.ok(kinds.has("grass") || kinds.has("canopy"));
  assert.equal(
    classifySakuraTile(mid, mid, matrix.size, true) === "trunk" ||
      classifySakuraTile(mid, mid, matrix.size, false) === "plot",
    true,
  );
  assert.ok(stacks.length > 0);
  assert.ok(stacks.every((stack) => stack.kind === "trunk" && stack.layer <= 2));
  assert.equal(
    stacks.some((stack) => stack.kind === "canopy"),
    false,
    "canopy voxels used to float between the trunk and the plot",
  );
  assert.ok(planSakuraStacks(matrix, true).every((stack) => stack.layer <= 1));
  assert.deepEqual(planSakuraStacks(matrix), planSakuraStacks(matrix));
});

test("the same url always grows the same tree", () => {
  const first = encodeSakuraQr("https://honeymatcha.io/tea");
  const second = encodeSakuraQr("https://honeymatcha.io/tea");
  assert.equal(first.seed, second.seed);
  assert.deepEqual(first.dark, second.dark);
});
