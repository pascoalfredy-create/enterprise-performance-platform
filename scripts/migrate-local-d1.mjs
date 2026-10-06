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
// already-migrated database would fail. Instead we check for a table only
// the last migration creates and skip entirely if it is already there.
//
// The check query is written to a temp .sql file and run via --file,
// never passed as a multi-word --command string: on Windows,
// execFileSync's shell:true hands the argument list to cmd.exe as a
// plain joined string, which splits unquoted spaces back into separate
// arguments — "SELECT name FROM ..." arrives at wrangler as five
// unrelated arguments instead of one. A single file path has no such
// problem.
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

function locationArgs() {
  return isRemote ? ["--remote"] : ["--local", "--persist-to", persistTo];
}

function wranglerD1File(filePath, extraArgs = []) {
  // Captured (non-"inherit") stdio means a failure throws with stdout/stderr
  // as raw Buffers, and Node's default uncaught-exception printer renders
  // those as a wall of byte numbers instead of the actual wrangler/Cloudflare
  // error text — decode and print them ourselves before rethrowing so CI
  // logs stay readable.
  try {
    return execFileSync(
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
        ...extraArgs,
      ],
      { cwd: projectRoot, shell: isWindows },
    );
  } catch (error) {
    const stdout = error.stdout?.toString("utf8");
    const stderr = error.stderr?.toString("utf8");
    if (stdout) console.error(stdout);
    if (stderr) console.error(stderr);
    throw new Error(`wrangler d1 execute failed (exit ${error.status}).`);
  }
}

const target = isRemote ? "remote" : "local";
const marker = "document_ocr_events";
const tmpDir = mkdtempSync(path.join(tmpdir(), "epp-d1-check-"));
const checkFile = path.join(tmpDir, "check.sql");
writeFileSync(
  checkFile,
  `SELECT name FROM sqlite_master WHERE type='table' AND name='${marker}';`,
);
function extractJsonResult(raw) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Local mode's stdout is exactly the JSON result, so the trimmed parse
    // above handles it. In --remote mode wrangler writes a "Checking if
    // file needs uploading" progress line (and, in some terminal widths, a
    // leading box-drawing/ANSI preamble) before the --json result, so a
    // naive indexOf("[") can land on a stray bracket inside that preamble
    // or ANSI color code rather than the real result — that caused the
    // very first production migration check to silently parse into
    // something falsy-but-not-throwing and skip every migration against an
    // actually-empty database. wrangler --json pretty-prints its result
    // starting at column 0, so scan backwards for the last line that opens
    // a JSON value and is itself parseable through to the end of the
    // output; that is unambiguously the real result, never a bracket
    // embedded mid-line in progress text.
    const lines = trimmed.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!/^[[{]/.test(lines[i])) continue;
      try {
        return JSON.parse(lines.slice(i).join("\n"));
      } catch {
        // keep scanning further back
      }
    }
    throw new Error(`wrangler d1 execute produced no parseable JSON:\n${raw}`);
  }
}

let check;
try {
  check = extractJsonResult(wranglerD1File(checkFile, ["--json"]).toString("utf8"));
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
console.log("Schema check result:", JSON.stringify(check));
if (check[0]?.results?.length) {
  console.log(`${target} D1 database already has the full schema — nothing to do.`);
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
