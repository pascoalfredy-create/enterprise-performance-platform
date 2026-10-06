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
// Not every migration's CREATE TABLE uses IF NOT EXISTS (the drizzle
// generator assumes its own once-only migration tracking, which this
// script does not replicate), so re-running the full loop on an
// already-migrated database would fail. Instead we check whether a table
// only the last migration creates already exists, and skip entirely if
// it does.
//
// That check used to SELECT the table's name out of sqlite_master and
// inspect the JSON --json result for a matching row. In --local mode
// that JSON is exactly what you'd expect (an empty `results` array, or
// one row). In --remote mode, this wrangler version's --json output for
// that query is NOT the matching rows at all — it's a stats summary
// object (`{"Total queries executed":1,"Rows read":1,...}`), present
// whether or not the table exists, which made `results.length` truthy
// either way and caused the very first production deploy to report
// "already has the full schema" and skip every migration against an
// actually-empty database (confirmed via the D1 dashboard console: only
// Cloudflare's own internal _cf_KV table existed).
//
// So instead, this tries to read one row from the marker table itself
// (not sqlite_master). It still turned out unsafe to key the decision off
// wrangler's own exit code alone: the exact same --file + SELECT-against-
// a-missing-table combination reported a clean exit twice in a row
// against the real production database immediately after a run that
// never got past the very first migration file — if the exit code
// reliably reflected the query's own success, that isn't possible. So
// the check now text-matches "no such table" in the captured output
// unconditionally (regardless of exit code) and only falls back to the
// exit code when that text isn't present; any failure that isn't "no
// such table" is a real problem and is left to fail loudly rather than
// being treated as "needs migration".
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

// The check query is written to a temp .sql file and run via --file,
// never passed as a multi-word --command string: on Windows,
// execFileSync's shell:true hands the argument list to cmd.exe as a
// plain joined string, which splits unquoted spaces back into separate
// arguments — "SELECT name FROM ..." arrives at wrangler as five
// unrelated arguments instead of one. A single file path has no such
// problem.
function runWranglerD1File(filePath) {
  // Capture output on success too, not just in the catch block: this
  // check's whole premise (query the marker table, read success/failure)
  // turned out to be unsafe to base purely on exit code — wrangler's own
  // apply loop below proved a real SQL error (CREATE TABLE ... already
  // exists) does exit non-zero against --remote, but this exact
  // --file + SELECT-against-a-missing-table combination still reported
  // ok:true against the real production database twice in a row right
  // after a run that had gotten no further than the very first migration
  // file, which cannot be true if the exit code reliably reflected the
  // query's own outcome. Text-match "no such table" in the output
  // unconditionally below, rather than trusting the exit code alone.
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

const marker = "document_ocr_events";
const tmpDir = mkdtempSync(path.join(tmpdir(), "epp-d1-check-"));
const checkFile = path.join(tmpDir, "check.sql");
writeFileSync(checkFile, `SELECT 1 FROM ${marker} LIMIT 1;`);
let check;
try {
  check = runWranglerD1File(checkFile);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (/no such table/i.test(check.output ?? "")) {
  // proceed below
} else if (check.ok) {
  console.log(`${target} D1 database already has the full schema — nothing to do.`);
  process.exit();
} else {
  console.error(check.output);
  console.error(`Could not determine whether the ${target} D1 database is migrated.`);
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

console.log(`Applying ${files.length} migration(s) to the ${target} D1 database...`);
for (const file of files) {
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
}
console.log(`${target} D1 database is up to date.`);
