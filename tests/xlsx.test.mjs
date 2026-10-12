import test from "node:test";
import assert from "node:assert/strict";
import { buildXlsxBlob, parseXlsxFile } from "../lib/xlsx.ts";

test("buildXlsxBlob produces a zip-valid workbook that parseXlsxFile reads back, including escaped and accented text and negative numbers", async () => {
  const blob = buildXlsxBlob([
    {
      name: "Demonstração",
      rows: [
        ["Linha", "Valor"],
        ["Receita líquida", 15000.5],
        ['Custos & "diretos" <especiais>', -3500],
        ["Texto com acentuação çãõ", 0],
      ],
    },
  ]);
  assert.equal(
    blob.type,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const file = new File([blob], "teste.xlsx", { type: blob.type });
  const rows = await parseXlsxFile(file);
  assert.deepEqual(rows[0], ["Linha", "Valor"]);
  assert.equal(rows[1][0], "Receita líquida");
  assert.equal(Number(rows[1][1]), 15000.5);
  assert.equal(rows[2][0], 'Custos & "diretos" <especiais>');
  assert.equal(Number(rows[2][1]), -3500);
  assert.equal(rows[3][0], "Texto com acentuação çãõ");
});

test("buildXlsxBlob supports multiple sheets with independent row shapes", async () => {
  const blob = buildXlsxBlob([
    { name: "Um", rows: [["a", 1]] },
    { name: "Dois", rows: [["b", 2], ["c", 3]] },
  ]);
  const file = new File([blob], "multi.xlsx", { type: blob.type });
  const rows = await parseXlsxFile(file);
  assert.deepEqual(rows[0], ["a", "1"]);
});

test("parseXlsxFile rejects a file that is not a valid zip archive", async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4])], "bad.xlsx");
  await assert.rejects(() => parseXlsxFile(file), /inválido/);
});
