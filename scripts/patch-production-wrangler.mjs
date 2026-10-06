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
//
// It also sets assets.not_found_handling: "none" and assets.binding:
// "ASSETS". The Cloudflare vite-plugin's build output declares an assets
// directory but leaves not_found_handling unset, and most app routes
// (SSR pages with no prerendered .html file) aren't literal files in that
// directory — so without "none", Cloudflare's static-asset layer answers
// a direct load/reload of those routes with a bare 404 instead of letting
// the request fall through to the Worker's own routing in worker/index.ts,
// which is what actually renders them. vinext's own `vinext deploy`
// generates wrangler config with this same setting for the same reason
// (see node_modules/vinext/dist/deploy.js); it's just that `vinext build`
// doesn't apply it to the config it emits. worker/index.ts also expects an
// `env.ASSETS` binding (for /_vinext/image), which needs assets.binding
// set explicitly — it isn't implied by the directory alone.
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
config.assets = {
  ...config.assets,
  not_found_handling: "none",
  binding: config.assets?.binding ?? "ASSETS",
};

writeFileSync(wranglerPath, JSON.stringify(config, null, 2));
console.log(`Patched ${path.relative(projectRoot, wranglerPath)} with production D1 id and ${Object.keys(vars).length} var(s).`);
