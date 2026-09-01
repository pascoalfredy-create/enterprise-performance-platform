import fs from "node:fs";
import path from "node:path";

const appDir = new URL("../app/", import.meta.url);
const catalogue = fs.readFileSync(new URL("../app/hr-localized-surface.tsx", import.meta.url), "utf8");
const translated = new Set(
  [...catalogue.matchAll(/\["((?:[^"\\]|\\.)*)","/g)].map((match) =>
    JSON.parse(`"${match[1]}"`).replace(/\s+/g, " ").trim(),
  ),
);
const technical = /^(?:[\d.,%+−→·×✓↗↓▧● ]+|[A-Z0-9_&/ .·→-]{2,}|Actual|Budget|Forecast|Payroll|HCM|HR|RBAC|OCR|API|OpenAPI|IFRS|FP&A|SFTP|CSV|PDF|JPG|PNG|AOA|USD|EUR)$/;
const findings = [];
const files=[];
function walk(directory,relative="") { for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const name=path.join(relative,entry.name);if(entry.isDirectory())walk(new URL(`${entry.name}/`,directory),name);else if(entry.name.endsWith(".tsx"))files.push({name,url:new URL(entry.name,directory)})} }
walk(appDir);
for (const {name:file,url} of files) {
  if (file === "hr-localized-surface.tsx") continue;
  const source = fs.readFileSync(url, "utf8");
  if (file !== "page.tsx" && source.includes("usePlatformLocale")) continue;
  const candidates = [];
  for (const match of source.matchAll(/>([^<{\n][^<{]*?)</g))
    candidates.push({ line: source.slice(0, match.index).split("\n").length, text: match[1] });
  for (const match of source.matchAll(/(?:placeholder|title|aria-label)=["']([^"']+)["']/g))
    candidates.push({ line: source.slice(0, match.index).split("\n").length, text: match[1] });
  for (const candidate of candidates) {
    const text = candidate.text.replace(/\s+/g, " ").trim();
    if (text.length < 3 || /[=();{}]/.test(text) || technical.test(text) || translated.has(text)) continue;
    findings.push({ file: path.join("app", file), line: candidate.line, text });
  }
}

const byFile = Object.groupBy(findings, (item) => item.file);
console.log(JSON.stringify({ untranslated: findings.length, files: Object.fromEntries(Object.entries(byFile).map(([file, items]) => [file, items.length])), findings }, null, 2));
if (process.argv.includes("--strict") && findings.length) process.exitCode = 1;
