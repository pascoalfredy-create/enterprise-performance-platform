#!/usr/bin/env node
// `vinext build` emits dist/server/wrangler.json with a placeholder D1
// database_id (SITE_CREATOR_PLACEHOLDER_DATABASE_ID in vite.config.ts) and
// no app `vars` — that file is meant for local dev, where the Cloudflare
// vite plugin creates the local D1/R2 bindings itself and worker/index.ts
// reads env vars from .dev.vars.
//
// For a real Cloudflare deploy there is no local binding step, so this
// patches the generated wrangler.json in place: the real D1 database_id
// comes from the D1_DATABASE_ID env var (set as a GitHub Actions secret,
// pointing at a database named "site-creator-d1" the account owner
// created once in the Cloudflare dashboard), and the app vars come
// straight from .dev.vars, which is intentionally committed to this repo
// (it holds only the publishable Supabase key and the owner's email — no
// secrets) so local dev and production always agree.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptsDir, "..");
const wranglerPath = path.join(projectRoot, "dist", "server", "wrangler.json");
const devVarsPath = path.join(projectRoot, ".dev.vars");

const databaseId = process.env.D1_DATABASE_ID;
if (!databaseId) {
  console.error("D1_DATABASE_ID is not set — cannot patch the production wrangler config.");
  process.exitCode = 1;
  process.exit();
}

const vars = {};
for (const line of readFileSync(devVarsPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const config = JSON.parse(readFileSync(wranglerPath, "utf8"));
config.vars = { ...config.vars, ...vars };
for (const db of config.d1_databases ?? []) {
  db.database_id = databaseId;
}

writeFileSync(wranglerPath, JSON.stringify(config, null, 2));
console.log(`Patched ${path.relative(projectRoot, wranglerPath)} with production D1 id and ${Object.keys(vars).length} var(s).`);
