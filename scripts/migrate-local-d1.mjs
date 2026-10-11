#!/usr/bin/env node
// Applies every drizzle/*.sql migration to a D1 database. Without this,
// that database only ever gets the tables worker/index.ts creates lazily
// via "CREATE TABLE IF NOT EXISTS" (tenants, platform_users, payroll,
// etc.) — commerce_accounts, checkout_sessions, billing_invoices and every
// other table that only exists in drizzle/*.sql are missing, so checkout,
// provisioning and several other flows fail with a generic "não foi
// possível..." error the first time anyone runs this against a fresh
// database.
//
// Local mode (default, `npm run db:migrate:local`) targets the database
// `npm run dev` / `npm run start` create under .wrangler/state.
// Remote mode (`--remote`, used by the production deploy workflow)
// targets the real Cloudflare D1 database and needs a wrangler config
// that already carries its real database_id — see
// scripts/patch-production-wrangler.mjs, which writes one to
// dist/server/wrangler.json before this script runs with
// `--remote --config dist/server/wrangler.json`.
//
// Per-file tracking (`_schema_migrations`, filename -> applied_at): each
// file in drizzle/ is applied at most once, ever. This replaced an
// earlier "all-or-nothing" design that detected a fully-migrated database
// by checking whether one marker table existed and, if not, re-ran every
// migration file from 0001 — which is NOT safe to repeat: several early
// files (e.g. 0010_employee_contracts.sql) contain a one-time
// `INSERT INTO ... SELECT` backfill with no `OR IGNORE`, and/or
// `CREATE TRIGGER` without `IF NOT EXISTS`, so replaying them against an
// already-migrated database throws a PRIMARY KEY conflict or a trigger
// validation error and aborts the whole migration step. Confirmed
// locally: inserting one employee row, then re-running
// 0010_employee_contracts.sql a second time, fails with
// "invalid employee contract" (SQLITE_CONSTRAINT_TRIGGER) — the
// backfill's legacy row satisfies the first run's validate-insert
// trigger (which only exists *after* that same run creates it), then an
// identical second run's backfill INSERT hits that already-created
// trigger expecting status='Rascunho', not the legacy 'Ativo' rows.
// Per-file tracking means a file that already ran is simply never run
// again, so this class of non-idempotent migration is safe by
// construction going forward.
//
// Bootstrapping an already-migrated database onto this tracking scheme
// (one exists today: production already has 0001-0042 applied, with no
// _schema_migrations table yet) must NOT replay those files to populate
// the tracking table — same conflict as above. Instead, if
// _schema_migrations is empty and the last-known-applied table from the
// old single-marker scheme exists, every file up to and including the
// migration that introduced that marker is recorded as already applied,
// without running them, before the normal per-file loop below considers
// anything newer.
//
// The "does table X exist" check used to be done by SELECTing the
// table's name out of sqlite_master and inspecting the JSON --json
// result for a matching row. In --local mode that JSON is exactly what
// you'd expect (an empty `results` array, or one row). In --remote mode,
// this wrangler version's --json output for that query is NOT the
// matching rows at all — it's a stats summary object
// (`{"Total queries executed":1,"Rows read":1,...}`), present whether or
// not the table exists, which made `results.length` truthy either way
// and caused the very first production deploy to report "already has
// the full schema" and skip every migration against an actually-empty
// database (confirmed via the D1 dashboard console: only Cloudflare's
// own internal _cf_KV table existed).
//
// So instead this tries to read one row from the table itself (not
// sqlite_master). It also turned out unsafe to key the decision off
// wrangler's own exit code alone: the exact same --file + SELECT-against-
// a-missing-table combination reported a clean exit twice in a row
// against the real production database immediately after a run that
// never got past the very first migration file — if the exit code
// reliably reflected the query's own success, that isn't possible. So
// the check text-matches "no such table" in the captured output
// unconditionally (regardless of exit code) and only falls back to the
// exit code when that text isn't present; any failure that isn't "no
// such table" is a real problem and is left to fail loudly rather than
// being treated as "table is missing".
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptsDir, "..");
const drizzleDir = path.join(projectRoot, "drizzle");
const isWindows = process.platform === "win32";

const args = process.argv.slice(2);
const isRemote = args.includes("--remote");
const configFlagIndex = args.indexOf("--config");
const configPath = configFlagIndex !== -1
  ? path.resolve(projectRoot, args[configFlagIndex + 1])
  : path.join(scriptsDir, "local-d1.wrangler.toml");
const persistTo = path.join(projectRoot, ".wrangler", "state");
const target = isRemote ? "remote" : "local";

function locationArgs() {
  return isRemote ? ["--remote"] : ["--local", "--persist-to", persistTo];
}

// The query is written to a temp .sql file and run via --file, never
// passed as a multi-word --command string: on Windows, execFileSync's
// shell:true hands the argument list to cmd.exe as a plain joined
// string, which splits unquoted spaces back into separate arguments —
// "SELECT name FROM ..." arrives at wrangler as five unrelated arguments
// instead of one. A single file path has no such problem.
function runWranglerD1File(filePath) {
  try {
    const stdout = execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "site-creator-d1",
        "--config",
        configPath,
        ...locationArgs(),
        "--file",
        filePath,
      ],
      { cwd: projectRoot, shell: isWindows },
    ).toString("utf8");
    return { ok: true, output: stdout };
  } catch (error) {
    return {
      ok: false,
      output: (error.stdout?.toString("utf8") ?? "") + (error.stderr?.toString("utf8") ?? ""),
    };
  }
}

function runWranglerD1Sql(sql) {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "epp-d1-"));
  const file = path.join(tmpDir, "run.sql");
  writeFileSync(file, sql);
  try {
    return runWranglerD1File(file);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function tableExists(table) {
  const result = runWranglerD1Sql(`SELECT 1 FROM ${table} LIMIT 1;`);
  if (/no such table/i.test(result.output ?? "")) return false;
  if (result.ok) return true;
  console.error(result.output);
  console.error(`Could not determine whether ${target} D1 table "${table}" exists.`);
  process.exitCode = 1;
  process.exit();
}

const files = readdirSync(drizzleDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (!files.length) {
  console.error("No migration files found in drizzle/.");
  process.exitCode = 1;
  process.exit();
}

const ensureTracking = runWranglerD1Sql(
  "CREATE TABLE IF NOT EXISTS _schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL);",
);
if (!ensureTracking.ok) {
  console.error(ensureTracking.output);
  console.error(`Could not create _schema_migrations on the ${target} D1 database.`);
  process.exitCode = 1;
  process.exit();
}

const trackingHasRows = tableExists("_schema_migrations") &&
  (() => {
    const probe = runWranglerD1Sql("SELECT 1 FROM _schema_migrations LIMIT 1;");
    return probe.ok && !/no such table/i.test(probe.output ?? "") &&
      !/"results":\s*\[\]/.test(probe.output ?? "");
  })();

// Legacy single-marker bootstrap: a database migrated before per-file
// tracking existed has every file through 0041_operational_ocr.sql
// (which creates document_ocr_events) and 0042_paypay_sandbox_transition.sql
// already applied, but no _schema_migrations rows recording that. Mark
// those files as applied without re-running them, once, the first time
// this script sees that database.
const LEGACY_MARKER_TABLE = "document_ocr_events";
const LEGACY_LAST_FILE = "0042_paypay_sandbox_transition.sql";
if (!trackingHasRows && tableExists(LEGACY_MARKER_TABLE)) {
  const legacyFiles = files.filter((name) => name <= LEGACY_LAST_FILE);
  console.log(
    `Bootstrapping _schema_migrations on the ${target} D1 database: marking ${legacyFiles.length} already-applied legacy migration(s) without re-running them.`,
  );
  const now = new Date().toISOString();
  const values = legacyFiles
    .map((name) => `('${name.replaceAll("'", "''")}','${now}')`)
    .join(",");
  const seed = runWranglerD1Sql(
    `INSERT OR IGNORE INTO _schema_migrations (filename,applied_at) VALUES ${values};`,
  );
  if (!seed.ok) {
    console.error(seed.output);
    console.error(`Could not bootstrap _schema_migrations on the ${target} D1 database.`);
    process.exitCode = 1;
    process.exit();
  }
}

const appliedCheck = runWranglerD1Sql("SELECT filename FROM _schema_migrations;");
const appliedFilenames = new Set(
  [...(appliedCheck.output ?? "").matchAll(/"filename":\s*"([^"]+)"/g)].map((m) => m[1]),
);
const pending = files.filter((name) => !appliedFilenames.has(name));

if (!pending.length) {
  console.log(`${target} D1 database already has the full schema — nothing to do.`);
  process.exit();
}

console.log(`Applying ${pending.length} migration(s) to the ${target} D1 database...`);
for (const file of pending) {
  console.log(`  ${file}`);
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "site-creator-d1",
      "--config",
      configPath,
      ...locationArgs(),
      "--file",
      path.join(drizzleDir, file),
    ],
    { cwd: projectRoot, stdio: "inherit", shell: isWindows },
  );
  const record = runWranglerD1Sql(
    `INSERT OR IGNORE INTO _schema_migrations (filename,applied_at) VALUES ('${file.replaceAll("'", "''")}','${new Date().toISOString()}');`,
  );
  if (!record.ok) {
    console.error(record.output);
    console.error(`${file} ran, but could not be recorded in _schema_migrations.`);
    process.exitCode = 1;
    process.exit();
  }
}
console.log(`${target} D1 database is up to date.`);
