#!/usr/bin/env node
// Applies every drizzle/*.sql migration to the local D1 database that
// `npm run dev` / `npm run start` create under .wrangler/state. Without
// this, that database only ever gets the tables worker/index.ts creates
// lazily via "CREATE TABLE IF NOT EXISTS" (tenants, platform_users,
// payroll, etc.) — commerce_accounts, checkout_sessions, billing_invoices
// and every other table that only exists in drizzle/*.sql are missing, so
// checkout, provisioning and several other flows fail with a generic
// "não foi possível..." error the first time anyone runs this locally.
//
// Not every migration's CREATE TABLE uses IF NOT EXISTS (the drizzle
// generator assumes its own once-only migration tracking, which this
// script does not replicate), so re-running the full loop on an
// already-migrated database would fail. Instead we check for a table only
// the last migration creates and skip entirely if it is already there.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptsDir, "..");
const drizzleDir = path.join(projectRoot, "drizzle");
const configPath = path.join(scriptsDir, "local-d1.wrangler.toml");
const persistTo = path.join(projectRoot, ".wrangler", "state");
const isWindows = process.platform === "win32";

function wranglerD1(args) {
  return execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "site-creator-d1",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      persistTo,
      ...args,
    ],
    { cwd: projectRoot, shell: isWindows },
  );
}

const marker = "document_ocr_events";
const check = JSON.parse(
  wranglerD1([
    "--json",
    "--command",
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${marker}'`,
  ]).toString("utf8"),
);
if (check[0]?.results?.length) {
  console.log("Local D1 database already has the full schema — nothing to do.");
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

console.log(`Applying ${files.length} migration(s) to the local D1 database...`);
for (const file of files) {
  console.log(`  ${file}`);
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "site-creator-d1",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      persistTo,
      "--file",
      path.join(drizzleDir, file),
    ],
    { cwd: projectRoot, stdio: "inherit", shell: isWindows },
  );
}
console.log("Local D1 database is up to date.");
