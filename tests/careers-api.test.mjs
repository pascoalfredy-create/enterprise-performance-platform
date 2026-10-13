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
  batch(statements) {
    return statements.map((s) => s.run());
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

test("public careers GET lists open, closed and cancelled requisitions (never drafts) with status, scoped by slug", async () => {
  const sqlite = seededDb();
  sqlite.exec(
    "INSERT INTO recruitment_requisitions (id,tenant_id,organization_id,title,department_code,positions,target_start_date,employment_type,budget_monthly_minor,currency,status,business_reason,created_by,created_at) VALUES ('r2','t1','o1','Vaga fechada','OPS',1,'2027-01-01','Efetivo',40000000,'AOA','Fechada','x','maker@test','now'),('r3','t1','o1','Vaga rascunho','OPS',1,'2027-01-01','Efetivo',40000000,'AOA','Rascunho','x','maker@test','now')",
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
  assert.equal(body.requisitions.length, 2);
  assert.ok(body.requisitions.every((r) => r.id !== "r3"));
  const open = body.requisitions.find((r) => r.id === "r1");
  assert.equal(open.status, "Aberta");
  const closed = body.requisitions.find((r) => r.id === "r2");
  assert.equal(closed.status, "Fechada");
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
          presentation:
            "Tenho experiência em análise financeira e grande interesse nesta vaga.",
          ...overrides,
        }),
      }),
      db,
      "calculo-sutil",
    );

  const noConsent = await apply({ consent: "" });
  assert.equal(noConsent.status, 400);

  const shortPresentation = await apply({ presentation: "Muito curto" });
  assert.equal(shortPresentation.status, 400);

  const first = await apply();
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.success, true);
  assert.ok(firstBody.candidateId);

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
        presentation:
          "Tenho experiência em análise financeira e grande interesse nesta vaga.",
      }),
    }),
    db,
    "calculo-sutil",
  );
  assert.equal(response.status, 429);
});

test("public careers POST accepts a spontaneous application without a requisitionId, capturing the rich profile", async () => {
  const sqlite = seededDb();
  const { careersApi } = await import("../worker/careers.ts");
  const db = new D1(sqlite);
  const response = await careersApi(
    new Request("https://example.test/api/careers/calculo-sutil", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "spontaneous",
        fullName: "Mariana Espontânea",
        email: "mariana@example.com",
        consent: "on",
        presentation:
          "Candidatura espontânea: quero contribuir com a área financeira.",
        currentRole: "Analista Sénior",
        currentEmployer: "Outra Empresa",
        yearsExperience: "6",
        highestEducation: "Mestrado",
      }),
    }),
    db,
    "calculo-sutil",
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  const candidate = sqlite
    .prepare(
      "SELECT current_role,years_experience,highest_education FROM recruitment_candidates WHERE id=?",
    )
    .get(body.candidateId);
  assert.equal(candidate.current_role, "Analista Sénior");
  assert.equal(candidate.years_experience, 6);
  assert.equal(candidate.highest_education, "Mestrado");
  const spontaneous = sqlite
    .prepare(
      "SELECT status FROM recruitment_spontaneous_applications WHERE candidate_id=?",
    )
    .get(body.candidateId);
  assert.equal(spontaneous.status, "Em avaliação");
});

test("public careers POST rejects an application without a vacancy or spontaneous flag", async () => {
  const sqlite = seededDb();
  const { careersApi } = await import("../worker/careers.ts");
  const db = new D1(sqlite);
  const response = await careersApi(
    new Request("https://example.test/api/careers/calculo-sutil", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Sem Vaga",
        email: "semvaga@example.com",
        consent: "on",
        presentation: "Candidatura sem indicar vaga nem tipo espontâneo.",
      }),
    }),
    db,
    "calculo-sutil",
  );
  assert.equal(response.status, 400);
});

class FakeBucket {
  constructor() {
    this.objects = new Map();
  }
  async put(key, value, options = {}) {
    this.objects.set(key, {
      body: value,
      size: value.byteLength ?? value.length ?? 0,
      httpMetadata: options.httpMetadata,
      customMetadata: options.customMetadata,
    });
  }
  async get(key) {
    return this.objects.get(key) || null;
  }
  async delete(key) {
    this.objects.delete(key);
  }
}

test("public careers document upload accepts a valid CV for a known candidate and rejects everything else", async () => {
  const sqlite = seededDb();
  sqlite.exec(
    "INSERT INTO recruitment_candidates (id,tenant_id,full_name,email,phone,source,consent_at,created_by,created_at) VALUES ('c1','t1','João Candidato','joao@example.com',NULL,'Website','now','candidatura-publica','now')",
  );
  sqlite.exec(
    "INSERT INTO tenants VALUES ('t2','now','Outra Empresa','outra-empresa','Ativo')",
  );
  const { careersDocumentApi } = await import("../worker/careers.ts");
  const db = new D1(sqlite);
  const bucket = new FakeBucket();
  const upload = (fields = {}) => {
    const form = new FormData();
    form.set("candidateId", fields.candidateId ?? "c1");
    form.set("documentType", fields.documentType ?? "CV");
    form.set(
      "file",
      fields.file ??
        new File([new Uint8Array([1, 2, 3, 4])], "cv.pdf", {
          type: "application/pdf",
        }),
    );
    return careersDocumentApi(
      new Request("https://example.test/api/careers/calculo-sutil/documents", {
        method: "POST",
        body: form,
      }),
      db,
      bucket,
      "calculo-sutil",
    );
  };

  const ok = await upload();
  assert.equal(ok.status, 201);
  const okBody = await ok.json();
  assert.ok(okBody.documentId);
  const stored = sqlite
    .prepare(
      "SELECT document_type,candidate_id FROM recruitment_candidate_documents WHERE id=?",
    )
    .get(okBody.documentId);
  assert.equal(stored.document_type, "CV");
  assert.equal(stored.candidate_id, "c1");
  assert.equal(bucket.objects.size, 1);

  const wrongTenant = await upload({ candidateId: "does-not-exist" });
  assert.equal(wrongTenant.status, 403);

  const wrongType = await upload({ documentType: "Inválido" });
  assert.equal(wrongType.status, 400);

  const wrongMime = await upload({
    file: new File([new Uint8Array([1, 2])], "cv.exe", {
      type: "application/x-msdownload",
    }),
  });
  assert.equal(wrongMime.status, 400);
});
