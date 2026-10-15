import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMigrationResults } from "../scripts/d1-migration-results.mjs";

test("tracking query preserves previously applied filenames", () => {
  const output = JSON.stringify([{success:true,results:[{filename:"0000_initial.sql"},{filename:"0010_contracts.sql"}]}]);
  const applied = parseMigrationResults(output);
  assert.deepEqual(["0000_initial.sql","0010_contracts.sql","0011_new.sql"].filter(file => !applied.has(file)), ["0011_new.sql"]);
});
test("empty successful tracking query allows initial migration", () => {
  assert.equal(parseMigrationResults('[{"success":true,"results":[]}]').size, 0);
});
test("import summaries, failures and malformed results cannot trigger replay", () => {
  for (const output of ["not JSON", "[]", '[{"success":false,"results":[]}]', '[{"success":true,"results":[{"Total queries executed":1}]}]', '[{"success":true}]']) {
    assert.throws(() => parseMigrationResults(output));
  }
});
