import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

test("i18n inventory is recursive and cannot regress",()=>{
  const result=JSON.parse(execFileSync(process.execPath,["scripts/audit-i18n.mjs"],{encoding:"utf8"}));
  assert.ok(result.untranslated<=333,`i18n debt increased to ${result.untranslated}`);
  assert.ok(Object.keys(result.files).some(file=>file.includes("onboarding/")));
});

test("localization uses complete authored phrases only",()=>{
  const source=fs.readFileSync(new URL("../app/hr-localized-surface.tsx",import.meta.url),"utf8");
  assert.match(source,/Token-by-token substitution is deliberately forbidden/);
  assert.match(source,/maps\[locale\]\.get\(value\)\?\?value/);
});

test("locale is loaded before module content is first rendered",()=>{
  const hook=fs.readFileSync(new URL("../app/use-platform-locale.ts",import.meta.url),"utf8");
  assert.match(hook,/useState<PlatformLocale>\(\(\) =>/);
  assert.match(hook,/localStorage\.getItem\("ep_locale"\)/);
});

test("finance and HR executive suites localize their complete headers",()=>{
  const finance=fs.readFileSync(new URL("../app/finance-suite.tsx",import.meta.url),"utf8");
  const hr=fs.readFileSync(new URL("../app/hr-manager-suite.tsx",import.meta.url),"utf8");
  assert.match(finance,/ФИНАНСОВАЯ ЭФФЕКТИВНОСТЬ И УПРАВЛЕНИЕ РЕШЕНИЯМИ/);
  assert.match(finance,/Оборотный капитал/);
  assert.match(finance,/Управленческий пакет/);
  assert.match(hr,/УПРАВЛЕНИЕ ПЕРСОНАЛОМ И ЗАРПЛАТОЙ/);
});
