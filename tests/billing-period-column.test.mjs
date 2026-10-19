import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const f of fs
    .readdirSync(new URL("../drizzle", import.meta.url))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort())
    sqlite.exec(fs.readFileSync(new URL("../drizzle/" + f, import.meta.url), "utf8"));
  return sqlite;
}

test("the legacy billing_interval column still only accepts monthly/annual", () => {
  const sqlite = setup();
  sqlite.exec("INSERT INTO commerce_accounts VALUES ('a1','sub:t','t@test','Ativa','now','now')");
  assert.throws(() =>
    sqlite.exec(
      "INSERT INTO checkout_sessions VALUES ('c1','a1','AO-2026-02','ENTERPRISE','semiannual',1,25,'AOA',100,'Pago','idem1','later','now','now',0,'semiannual')",
    ),
  );
});

test("the new billing_period column accepts 'semiannual' independently of the legacy column", () => {
  const sqlite = setup();
  sqlite.exec("INSERT INTO commerce_accounts VALUES ('a1','sub:t','t@test','Ativa','now','now')");
  sqlite.exec(
    "INSERT INTO checkout_sessions VALUES ('c1','a1','AO-2026-02','ENTERPRISE','monthly',1,25,'AOA',100,'Pago','idem1','later','now','now',0,'semiannual')",
  );
  const row = sqlite.prepare("SELECT billing_interval,billing_period FROM checkout_sessions WHERE id='c1'").get();
  assert.equal(row.billing_interval, "monthly");
  assert.equal(row.billing_period, "semiannual");
});

test("the alias pattern used by the worker ('SELECT *, billing_period billing_interval') surfaces the real interval under the billing_interval key, matching what the client already expects", () => {
  const sqlite = setup();
  sqlite.exec(
    "INSERT INTO commerce_accounts VALUES ('a1','sub:t','t@test','Ativa','now','now');" +
      "INSERT INTO checkout_sessions VALUES ('c1','a1','AO-2026-02','ENTERPRISE','monthly',1,25,'AOA',100,'Pago','idem1','later','now','now',0,'semiannual')",
  );
  const row = sqlite
    .prepare("SELECT *,billing_period billing_interval FROM checkout_sessions WHERE id='c1'")
    .get();
  assert.equal(row.billing_interval, "semiannual");
});
