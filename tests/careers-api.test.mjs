import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }
  bind(...v) {
    this.values = v;
    return this;
  }
  run() {
    try {
      return this.db.prepare(this.sql).run(...this.values);
    } catch (e) {
      e.message += ` [${this.sql}]`;
      throw e;
    }
  }
  first() {
    return this.db.prepare(this.sql).get(...this.values);
  }
  all() {
    return { results: this.db.prepare(this.sql).all(...this.values) };
  }
}
class D1 {
  constructor(db) {
    this.db = db;
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
}

function seededDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of fs
    .readdirSync(new URL("../drizzle", import.meta.url))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.exec(
      fs.readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"),
    );
  sqlite.exec(
    "INSERT INTO tenants VALUES ('t1','now','Cálculo Sutil','calculo-sutil','Ativo')",
  );
  sqlite.exec(
    "INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Cálculo Sutil','Empresa','AOA','Ativa')",
  );
  sqlite.exec(
    "INSERT INTO recruitment_requisitions (id,tenant_id,organization_id,title,department_code,positions,target_start_date,employment_type,budget_monthly_minor,currency,status,business_reason,created_by,created_at,approved_by,approved_at) VALUES ('r1','t1','o1','Analista Financeiro','FIN',1,'2027-01-01','Efetivo',50000000,'AOA','Aberta','Expansão aprovada','maker@test','now','checker@test','later')",
  );
  return sqlite;
}

test("public careers GET lists only open requisitions for the resolved tenant, scoped by slug", async () => {
  const sqlite = seededDb();
  sqlite.exec(
    "INSERT INTO recruitment_requisitions (id,tenant_id,organization_id,title,department_code,positions,target_start_date,employment_type,budget_monthly_minor,currency,status,business_reason,created_by,created_at) VALUES ('r2','t1','o1','Vaga fechada','OPS',1,'2027-01-01','Efetivo',40000000,'AOA','Fechada','x','maker@test','now')",
  );
  const { careersApi } = await import("../worker/careers.ts");
  const db = new D1(sqlite);
  const okResponse = await careersApi(
    new Request("https://example.test/api/careers/calculo-sutil"),
    db,
    "calculo-sutil",
  );
  assert.equal(okResponse.status, 200);
  const body = await okResponse.json();
  assert.equal(body.companyName, "Cálculo Sutil");
  assert.equal(body.requisitions.length, 1);
  assert.equal(body.requisitions[0].id, "r1");
  assert.equal(body.requisitions[0].budgetMonthlyMinor, undefined);

  const missingResponse = await careersApi(
    new Request("https://example.test/api/careers/nao-existe"),
    db,
    "nao-existe",
  );
  assert.equal(missingResponse.status, 404);
});

test("public careers POST creates a candidate and application, rejects a second application to the same job, and requires consent", async () => {
  const sqlite = seededDb();
  const { careersApi } = await import("../worker/careers.ts");
  const db = new D1(sqlite);
  const apply = (overrides = {}) =>
    careersApi(
      new Request("https://example.test/api/careers/calculo-sutil", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requisitionId: "r1",
          fullName: "João Candidato",
          email: "joao@example.com",
          phone: "+244923000000",
          consent: "on",
          ...overrides,
        }),
      }),
      db,
      "calculo-sutil",
    );

  const noConsent = await apply({ consent: "" });
  assert.equal(noConsent.status, 400);

  const first = await apply();
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.success, true);

  const candidateRow = sqlite
    .prepare(
      "SELECT id FROM recruitment_candidates WHERE tenant_id='t1' AND email='joao@example.com'",
    )
    .get();
  assert.ok(candidateRow);
  const applicationCount = sqlite
    .prepare(
      "SELECT COUNT(*) n FROM recruitment_applications WHERE tenant_id='t1' AND candidate_id=?",
    )
    .get(candidateRow.id);
  assert.equal(applicationCount.n, 1);

  const duplicate = await apply();
  assert.equal(duplicate.status, 409);

  const closedRequisition = await apply({ requisitionId: "does-not-exist" });
  assert.equal(closedRequisition.status, 404);
});

test("public careers POST enforces a daily per-tenant application cap", async () => {
  const sqlite = seededDb();
  const now = new Date().toISOString();
  for (let i = 0; i < 200; i++)
    sqlite
      .prepare(
        "INSERT INTO recruitment_candidates (id,tenant_id,full_name,email,phone,source,consent_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        `seed-${i}`,
        "t1",
        `Seed ${i}`,
        `seed${i}@example.com`,
        null,
        "Website",
        now,
        "candidatura-publica",
        now,
      );
  const { careersApi } = await import("../worker/careers.ts");
  const db = new D1(sqlite);
  const response = await careersApi(
    new Request("https://example.test/api/careers/calculo-sutil", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requisitionId: "r1",
        fullName: "Outra Pessoa",
        email: "outra@example.com",
        consent: "on",
      }),
    }),
    db,
    "calculo-sutil",
  );
  assert.equal(response.status, 429);
});
