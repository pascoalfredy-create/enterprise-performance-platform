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
// migration file from 0001 — which is NOT safe to repeat in general:
// several early files contain a one-time `INSERT ... SELECT` backfill
// and/or bare `CREATE TRIGGER` (both now fixed to be idempotent — see
// below), and one file uses `ALTER TABLE ... ADD COLUMN`, which SQLite
// has no idempotent form for at all.
//
// Earlier still, this used a one-time bootstrap step: if the tracking
// table was empty and a specific legacy marker table existed, every file
// up to the one that introduced that marker was recorded as applied
// without running them. That bootstrap itself turned out unreliable: in
// production it incorrectly decided the marker table was missing (when
// it in fact already existed — the *previous* deploy, using the old
// single-marker script, had exited in under 2 seconds reporting "already
// has the full schema", which is only possible if the marker was already
// there), causing a real deploy to attempt a full replay from 0000 and
// fail partway through on a non-idempotent CREATE TRIGGER. Rather than
// chase why that one probe query gave a wrong answer against remote D1,
// the bootstrap step was removed entirely in favor of something that
// doesn't depend on any pre-flight probe being right:
//
// Each pending file is simply attempted. A clean success records it as
// applied, as normal. A failure whose message matches "already exists"
// or "duplicate column" means this exact file's objects are already in
// the database from before per-file tracking existed — D1 runs each
// --file execution as one atomic unit (confirmed by wrangler's own "if
// the execution fails to complete, your DB will return to its original
// state" message), so every file in this repository's history has only
// ever been applied as all-or-nothing; a conflict on its first statement
// is therefore proof the whole file already landed previously, not that
// it's half-applied. That failure is recorded as applied (with a warning)
// instead of aborting, and the loop moves on. A failure matching neither
// pattern is a real, new problem and still aborts the whole migration
// step loudly, exactly as before — this only changes the one specific
// case of a historically-applied-but-untracked file.
import { parseMigrationResults } from "./d1-migration-results.mjs";
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

// The query/file is run via --file, never passed as a multi-word
// --command string: on Windows, execFileSync's shell:true hands the
// argument list to cmd.exe as a plain joined string, which splits
// unquoted spaces back into separate arguments — "SELECT name FROM ..."
// arrives at wrangler as five unrelated arguments instead of one. A
// single file path has no such problem.
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

// Query results require --command: remote --file returns an import summary.
// Invoke the JS CLI without a shell to preserve SQL arguments on Windows too.
let appliedFilenames;
try {
  const output = execFileSync(process.execPath, [
    path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    "d1", "execute", "site-creator-d1", "--config", configPath,
    ...locationArgs(), "--command", "SELECT filename FROM _schema_migrations;", "--json",
  ], { cwd: projectRoot, encoding: "utf8" });
  appliedFilenames = parseMigrationResults(output);
} catch (error) {
  console.error(`Could not read _schema_migrations on the ${target} D1 database.`, error.message);
  process.exit(1);
}
const pending = files.filter((name) => !appliedFilenames.has(name));

if (!pending.length) {
  console.log(`${target} D1 database already has the full schema — nothing to do.`);
  process.exit();
}

console.log(`Applying ${pending.length} migration(s) to the ${target} D1 database...`);
for (const file of pending) {
  console.log(`  ${file}`);
  const result = runWranglerD1File(path.join(drizzleDir, file));
  console.log(result.output);
  if (!result.ok) {
    if (/already exists|duplicate column/i.test(result.output)) {
      console.log(
        `  ${file} reports objects that already exist — this file already landed before per-file tracking existed. Recording it as applied without retrying.`,
      );
    } else {
      console.error(`${file} failed.`);
      process.exitCode = 1;
      process.exit();
    }
  }
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
