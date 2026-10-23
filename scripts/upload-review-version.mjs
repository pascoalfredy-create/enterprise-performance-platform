#!/usr/bin/env node
// Uploads a review version only. Never activates a deployment or runs migrations.
import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function reviewContext(event,repository){
  const pr=event.pull_request;
  const allowed=new Map([[40,'feat/faithful-payroll-reports-20261020'],[41,'fix/canonical-workspaces-20261022'],[42,'fix/budget-reconciliation-20261023'],[43,'feat/budget-capex-20261023'],[45,'feat/treasury-depreciation-20261023']]);
  if(!pr||pr.head?.repo?.full_name!==repository||allowed.get(pr.number)!==pr.head?.ref)
    throw new Error('Only explicitly approved same-repository review branches may upload a version.');
  return `pr-${pr.number}`;
}
export function checkReviewConfig(config,databaseId){
  if(!databaseId||config.name!=='enterprise-performance-platform'||config.keep_vars!==true||
    config.d1_databases?.length!==1||config.d1_databases[0].database_id!==databaseId||
    config.assets?.binding!=='ASSETS')throw new Error('Unexpected review configuration. Upload cancelled.');
}
export function activeDeployment(body){
  if(body.success!==true||!Array.isArray(body.result?.deployments)||!body.result.deployments.length)
    throw new Error('Unable to verify the active Cloudflare deployment.');
  const latest=[...body.result.deployments].sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];
  return JSON.stringify({id:latest.id,versions:latest.versions});
}
async function main(){
  const alias=reviewContext(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),process.env.GITHUB_REPOSITORY);
  for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','D1_DATABASE_ID'])
    if(!process.env[key])throw new Error(`Missing GitHub Actions secret: ${key}.`);
  const configPath='dist/server/wrangler.json';
  checkReviewConfig(JSON.parse(readFileSync(configPath,'utf8')),process.env.D1_DATABASE_ID);
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/workers/scripts/enterprise-performance-platform/deployments`;
  async function snapshot(){
    const response=await fetch(endpoint,{headers:{authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`}});
    if(!response.ok)throw new Error(`Cannot read active deployment (HTTP ${response.status}).`);
    return activeDeployment(await response.json());
  }
  const before=await snapshot();
  const output=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','versions','upload',
    '--config',configPath,'--preview-alias',alias,'--message',`${alias} — visual review, no production activation`],
    {encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  process.stdout.write(output);
  const clean=output.replace(/\u001b\[[0-9;]*m/g,'');
  const url=clean.match(/Version Preview URL:\s*(https:\/\/[^\s]+\.workers\.dev)/)?.[1];
  if(!url)throw new Error('Cloudflare did not return a version URL.');
  const after=await snapshot();
  if(before!==after)throw new Error('The active deployment changed during review upload. Inspect before continuing; no rollback was attempted.');
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\n## ${alias} — review version\n\n${url}\n\nActive production deployment unchanged. This version shares the existing runtime resources and permissions; it is not an isolated test database. No migrations or production activation were performed.\n`);
  console.log('Verified: active production deployment unchanged.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
