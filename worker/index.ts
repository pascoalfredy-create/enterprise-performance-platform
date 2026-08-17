/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const TENANT = "demo-tenant";
const uid = () => crypto.randomUUID();
async function ensureSetupSchema(db: D1Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS platform_users (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, organization_id TEXT, status TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, employee_number TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, organization_id TEXT NOT NULL, job_title TEXT NOT NULL, hire_date TEXT NOT NULL, status TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, actor TEXT NOT NULL, summary TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS financial_dimensions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS dimension_members (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, dimension_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, parent_id TEXT, status TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS budget_versions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, name TEXT NOT NULL, fiscal_year INTEGER NOT NULL, status TEXT NOT NULL, approved_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS performance_entries (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, organization_id TEXT NOT NULL, period TEXT NOT NULL, scenario TEXT NOT NULL, version_id TEXT, currency TEXT NOT NULL, line_code TEXT NOT NULL, line_name TEXT NOT NULL, dimension_member_id TEXT, amount_minor INTEGER NOT NULL, source TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS salary_profiles (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, employee_id TEXT NOT NULL, currency TEXT NOT NULL, periodicity TEXT NOT NULL, base_minor INTEGER NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, dimension_member_id TEXT, status TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS payroll_components (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, method TEXT NOT NULL, value_minor INTEGER, rate_bps INTEGER, calculation_order INTEGER NOT NULL, status TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS payroll_assignments (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, employee_id TEXT NOT NULL, component_id TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS payroll_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, period TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, employee_count INTEGER NOT NULL, gross_minor INTEGER NOT NULL, deduction_minor INTEGER NOT NULL, employer_minor INTEGER NOT NULL, net_minor INTEGER NOT NULL, closed_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS payroll_run_lines (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, run_id TEXT NOT NULL, employee_id TEXT NOT NULL, base_minor INTEGER NOT NULL, gross_minor INTEGER NOT NULL, deduction_minor INTEGER NOT NULL, employer_minor INTEGER NOT NULL, net_minor INTEGER NOT NULL, calculation_hash TEXT NOT NULL, input_snapshot TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS workforce_cost_postings (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, run_id TEXT NOT NULL, run_line_id TEXT NOT NULL, employee_id TEXT NOT NULL, organization_id TEXT NOT NULL, dimension_member_id TEXT, period TEXT NOT NULL, currency TEXT NOT NULL, gross_minor INTEGER NOT NULL, employer_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL, source_hash TEXT NOT NULL, posted_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS management_reports (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, report_number INTEGER NOT NULL, title TEXT NOT NULL, template TEXT NOT NULL, period TEXT NOT NULL, currency TEXT NOT NULL, budget_version_id TEXT, status TEXT NOT NULL, payload_json TEXT NOT NULL, input_hash TEXT NOT NULL, created_by TEXT NOT NULL)"),
  ]);
}
async function setupSnapshot(db: D1Database) {
  const [organizations, users, employees, audit, dimensions, dimensionMembers] = await Promise.all([
    db.prepare("SELECT * FROM organizations WHERE tenant_id=? ORDER BY created_at").bind(TENANT).all(),
    db.prepare("SELECT * FROM platform_users WHERE tenant_id=? ORDER BY created_at").bind(TENANT).all(),
    db.prepare("SELECT * FROM employees WHERE tenant_id=? ORDER BY created_at DESC").bind(TENANT).all(),
    db.prepare("SELECT * FROM audit_events WHERE tenant_id=? ORDER BY created_at DESC LIMIT 8").bind(TENANT).all(),
    db.prepare("SELECT d.*, COUNT(m.id) AS member_count FROM financial_dimensions d LEFT JOIN dimension_members m ON m.dimension_id=d.id AND m.tenant_id=d.tenant_id WHERE d.tenant_id=? GROUP BY d.id ORDER BY d.created_at").bind(TENANT).all(),
    db.prepare("SELECT * FROM dimension_members WHERE tenant_id=? ORDER BY dimension_id, parent_id, code").bind(TENANT).all(),
  ]);
  return { organizations: organizations.results, users: users.results, employees: employees.results, audit: audit.results, dimensions: dimensions.results, dimensionMembers: dimensionMembers.results };
}
async function setupApi(request: Request, db: D1Database) {
  try {
    await ensureSetupSchema(db);
    if (request.method === "GET") return Response.json(await setupSnapshot(db));
    if (request.method !== "POST") return Response.json({error:"Método não permitido."},{status:405});
    const body = await request.json() as Record<string,string>, created = new Date().toISOString(), recordId = uid();
    const actor = request.headers.get("x-openai-user-email") || "utilizador autenticado";
    let summary = "";
    if (body.type === "organization") {
      if (!body.name?.trim() || !body.code?.trim() || !body.currency?.trim()) return Response.json({error:"Nome, código e moeda são obrigatórios."},{status:400});
      if (await db.prepare("SELECT id FROM organizations WHERE tenant_id=? AND code=?").bind(TENANT,body.code.trim().toUpperCase()).first()) return Response.json({error:"Já existe uma unidade com este código."},{status:409});
      summary=`Unidade ${body.name.trim()} criada`;
      await db.prepare("INSERT INTO organizations (id,tenant_id,code,name,kind,currency,status,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(recordId,TENANT,body.code.trim().toUpperCase(),body.name.trim(),body.kind||"Unidade",body.currency.trim().toUpperCase(),"Ativa",created).run();
    } else if (body.type === "user") {
      if (!body.name?.trim() || !/^\S+@\S+\.\S+$/.test(body.email||"")) return Response.json({error:"Indique um nome e um email válido."},{status:400});
      if (await db.prepare("SELECT id FROM platform_users WHERE tenant_id=? AND lower(email)=lower(?)").bind(TENANT,body.email.trim()).first()) return Response.json({error:"Este email já tem acesso ou convite."},{status:409});
      summary=`Convite enviado a ${body.email.trim()}`;
      await db.prepare("INSERT INTO platform_users (id,tenant_id,name,email,role,organization_id,status,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(recordId,TENANT,body.name.trim(),body.email.trim().toLowerCase(),body.role||"Gestor",body.organizationId||null,"Convite enviado",created).run();
    } else if (body.type === "employee") {
      if (!body.employeeNumber?.trim() || !body.firstName?.trim() || !body.lastName?.trim() || !body.organizationId || !body.hireDate) return Response.json({error:"Preencha todos os campos obrigatórios."},{status:400});
      if (await db.prepare("SELECT id FROM employees WHERE tenant_id=? AND employee_number=?").bind(TENANT,body.employeeNumber.trim().toUpperCase()).first()) return Response.json({error:"O número de colaborador já existe."},{status:409});
      summary=`Colaborador ${body.firstName.trim()} ${body.lastName.trim()} criado`;
      await db.prepare("INSERT INTO employees (id,tenant_id,employee_number,first_name,last_name,organization_id,job_title,hire_date,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(recordId,TENANT,body.employeeNumber.trim().toUpperCase(),body.firstName.trim(),body.lastName.trim(),body.organizationId,body.jobTitle?.trim()||"Por definir",body.hireDate,"Ativo",created).run();
    } else if (body.type === "dimension") {
      if (!body.name?.trim() || !body.code?.trim()) return Response.json({error:"Nome e código são obrigatórios."},{status:400});
      if (await db.prepare("SELECT id FROM financial_dimensions WHERE tenant_id=? AND code=?").bind(TENANT,body.code.trim().toUpperCase()).first()) return Response.json({error:"Já existe uma dimensão com este código."},{status:409});
      summary=`Dimensão ${body.name.trim()} criada`;
      await db.prepare("INSERT INTO financial_dimensions (id,tenant_id,code,name,description,status,created_at) VALUES (?,?,?,?,?,?,?)").bind(recordId,TENANT,body.code.trim().toUpperCase(),body.name.trim(),body.description?.trim()||"Dimensão configurável","Ativa",created).run();
    } else if (body.type === "dimensionMember") {
      if (!body.dimensionId || !body.name?.trim() || !body.code?.trim()) return Response.json({error:"Dimensão, nome e código são obrigatórios."},{status:400});
      if (await db.prepare("SELECT id FROM dimension_members WHERE tenant_id=? AND dimension_id=? AND code=?").bind(TENANT,body.dimensionId,body.code.trim().toUpperCase()).first()) return Response.json({error:"Este código já existe na dimensão."},{status:409});
      if (body.parentId && !(await db.prepare("SELECT id FROM dimension_members WHERE tenant_id=? AND dimension_id=? AND id=?").bind(TENANT,body.dimensionId,body.parentId).first())) return Response.json({error:"O membro superior não pertence à dimensão."},{status:400});
      summary=`Membro ${body.name.trim()} adicionado à dimensão`;
      await db.prepare("INSERT INTO dimension_members (id,tenant_id,dimension_id,code,name,parent_id,status,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(recordId,TENANT,body.dimensionId,body.code.trim().toUpperCase(),body.name.trim(),body.parentId||null,"Ativo",created).run();
    } else return Response.json({error:"Operação não suportada."},{status:400});
    await db.prepare("INSERT INTO audit_events (id,tenant_id,action,entity_type,entity_id,actor,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),TENANT,"CREATE",body.type,recordId,actor,summary,created).run();
    return Response.json(await setupSnapshot(db),{status:201});
  } catch(error) { return Response.json({error:error instanceof Error?error.message:"Erro de persistência."},{status:500}); }
}

function parseMinor(value:string){const clean=value.trim().replace(/\s/g,"").replace(",",".");if(!/^-?\d+(\.\d{1,2})?$/.test(clean))throw new Error("Indique um valor monetário válido, com até duas casas decimais.");const negative=clean.startsWith("-");const [whole,dec=""]=clean.replace("-","").split(".");const minor=Number(whole)*100+Number(dec.padEnd(2,"0"));if(!Number.isSafeInteger(minor))throw new Error("Valor fora do limite permitido.");return negative?-minor:minor}
async function performanceSnapshot(db:D1Database, url:URL){
  const period=url.searchParams.get("period")||new Date().toISOString().slice(0,7),currency=(url.searchParams.get("currency")||"AOA").toUpperCase(),version=url.searchParams.get("version")||"";
  const [entries,versions,organizations,members,summary,audit]=await Promise.all([
    db.prepare("SELECT e.*, o.name AS organization_name, m.name AS dimension_member_name FROM performance_entries e JOIN organizations o ON o.id=e.organization_id LEFT JOIN dimension_members m ON m.id=e.dimension_member_id WHERE e.tenant_id=? AND e.period=? AND e.currency=? AND (e.scenario='Actual' OR e.version_id=?) ORDER BY e.created_at DESC LIMIT 100").bind(TENANT,period,currency,version).all(),
    db.prepare("SELECT * FROM budget_versions WHERE tenant_id=? ORDER BY fiscal_year DESC, created_at DESC").bind(TENANT).all(),
    db.prepare("SELECT id,name,code,currency FROM organizations WHERE tenant_id=? AND status='Ativa' ORDER BY name").bind(TENANT).all(),
    db.prepare("SELECT m.id,m.name,m.code,d.name AS dimension_name FROM dimension_members m JOIN financial_dimensions d ON d.id=m.dimension_id WHERE m.tenant_id=? AND m.status='Ativo' ORDER BY d.name,m.code").bind(TENANT).all(),
    db.prepare("SELECT COALESCE(SUM(CASE WHEN scenario='Actual' THEN amount_minor ELSE 0 END),0) AS actual_minor, COALESCE(SUM(CASE WHEN scenario='Budget' AND version_id=? THEN amount_minor ELSE 0 END),0) AS budget_minor FROM performance_entries WHERE tenant_id=? AND period=? AND currency=?").bind(version,TENANT,period,currency).first(),
    db.prepare("SELECT * FROM audit_events WHERE tenant_id=? AND entity_type IN ('performanceEntry','budgetVersion','approveBudget') ORDER BY created_at DESC LIMIT 6").bind(TENANT).all(),
  ]);
  const actual=Number(summary?.actual_minor||0),budget=Number(summary?.budget_minor||0),variance=actual-budget,varianceBps=budget===0?null:Math.trunc(variance*10000/budget);
  return {period,currency,entries:entries.results,versions:versions.results,organizations:organizations.results,members:members.results,summary:{actualMinor:actual,budgetMinor:budget,varianceMinor:variance,varianceBps},audit:audit.results};
}
async function performanceApi(request:Request,db:D1Database){
 try{await ensureSetupSchema(db);const url=new URL(request.url);if(request.method==="GET")return Response.json(await performanceSnapshot(db,url));if(request.method!=="POST")return Response.json({error:"Método não permitido."},{status:405});
 const body=await request.json() as Record<string,string>,created=new Date().toISOString(),recordId=uid(),actor=request.headers.get("x-openai-user-email")||"utilizador autenticado";let summary="",entityType=body.type;
 if(body.type==="budgetVersion"){
   const year=Number(body.fiscalYear);if(!body.name?.trim()||!Number.isInteger(year)||year<2000||year>2200)return Response.json({error:"Nome e ano fiscal válidos são obrigatórios."},{status:400});
   summary=`Versão orçamental ${body.name.trim()} criada`;await db.prepare("INSERT INTO budget_versions (id,tenant_id,name,fiscal_year,status,approved_at,created_at) VALUES (?,?,?,?,?,?,?)").bind(recordId,TENANT,body.name.trim(),year,"Rascunho",null,created).run();
 }else if(body.type==="performanceEntry"){
   if(!body.organizationId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period||"")||!['Actual','Budget'].includes(body.scenario)||!body.currency?.match(/^[A-Za-z]{3}$/)||!body.lineCode?.trim()||!body.lineName?.trim())return Response.json({error:"Preencha organização, período, cenário, moeda e linha."},{status:400});
   if(!(await db.prepare("SELECT id FROM organizations WHERE id=? AND tenant_id=?").bind(body.organizationId,TENANT).first()))return Response.json({error:"Organização inválida."},{status:400});
   if(body.scenario==="Budget"){if(!body.versionId)return Response.json({error:"Selecione uma versão orçamental."},{status:400});const v=await db.prepare("SELECT status FROM budget_versions WHERE id=? AND tenant_id=?").bind(body.versionId,TENANT).first<{status:string}>();if(!v||v.status!=="Rascunho")return Response.json({error:"Apenas versões em rascunho aceitam lançamentos."},{status:409});}
   if(body.dimensionMemberId&&!(await db.prepare("SELECT id FROM dimension_members WHERE id=? AND tenant_id=?").bind(body.dimensionMemberId,TENANT).first()))return Response.json({error:"Membro dimensional inválido."},{status:400});
   const amount=parseMinor(body.amount);summary=`${body.scenario==='Actual'?'Realizado':'Orçamento'} ${body.lineCode.trim().toUpperCase()} registado`;
   await db.prepare("INSERT INTO performance_entries (id,tenant_id,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(recordId,TENANT,body.organizationId,body.period,body.scenario,body.scenario==="Budget"?body.versionId:null,body.currency.toUpperCase(),body.lineCode.trim().toUpperCase(),body.lineName.trim(),body.dimensionMemberId||null,amount,"Manual",created).run();
 }else if(body.type==="approveBudget"){
   const version=await db.prepare("SELECT name,status FROM budget_versions WHERE id=? AND tenant_id=?").bind(body.versionId,TENANT).first<{name:string,status:string}>();if(!version||version.status!=="Rascunho")return Response.json({error:"A versão não está disponível para aprovação."},{status:409});
   await db.prepare("UPDATE budget_versions SET status='Aprovado', approved_at=? WHERE id=? AND tenant_id=?").bind(created,body.versionId,TENANT).run();summary=`Versão orçamental ${version.name} aprovada`;entityType="approveBudget";
 }else return Response.json({error:"Operação não suportada."},{status:400});
 await db.prepare("INSERT INTO audit_events (id,tenant_id,action,entity_type,entity_id,actor,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),TENANT,body.type==="approveBudget"?"APPROVE":"CREATE",entityType,body.type==="approveBudget"?body.versionId:recordId,actor,summary,created).run();
 return Response.json(await performanceSnapshot(db,new URL(`${url.origin}/api/performance?period=${encodeURIComponent(body.period||url.searchParams.get('period')||new Date().toISOString().slice(0,7))}&currency=${encodeURIComponent(body.currency||url.searchParams.get('currency')||'AOA')}&version=${encodeURIComponent(body.versionId||url.searchParams.get('version')||'')}`)),{status:201});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Erro de processamento."},{status:500})}
}

async function payrollSnapshot(db:D1Database){
 const [profiles,components,runs,employees,members,audit]=await Promise.all([
  db.prepare("SELECT p.*, e.first_name||' '||e.last_name AS employee_name, e.employee_number, m.name AS dimension_member_name FROM salary_profiles p JOIN employees e ON e.id=p.employee_id LEFT JOIN dimension_members m ON m.id=p.dimension_member_id WHERE p.tenant_id=? ORDER BY p.created_at DESC").bind(TENANT).all(),
  db.prepare("SELECT c.*, e.first_name||' '||e.last_name AS employee_name FROM payroll_components c LEFT JOIN payroll_assignments a ON a.component_id=c.id AND a.tenant_id=c.tenant_id LEFT JOIN employees e ON e.id=a.employee_id WHERE c.tenant_id=? ORDER BY c.calculation_order,c.code").bind(TENANT).all(),
  db.prepare("SELECT * FROM payroll_runs WHERE tenant_id=? ORDER BY period DESC,created_at DESC LIMIT 12").bind(TENANT).all(),
  db.prepare("SELECT id,employee_number,first_name,last_name FROM employees WHERE tenant_id=? AND status='Ativo' ORDER BY first_name,last_name").bind(TENANT).all(),
  db.prepare("SELECT m.id,m.name,m.code,d.name AS dimension_name FROM dimension_members m JOIN financial_dimensions d ON d.id=m.dimension_id WHERE m.tenant_id=? AND m.status='Ativo' ORDER BY d.name,m.code").bind(TENANT).all(),
  db.prepare("SELECT * FROM audit_events WHERE tenant_id=? AND entity_type IN ('salaryProfile','payrollComponent','payrollRun') ORDER BY created_at DESC LIMIT 6").bind(TENANT).all(),
 ]);return {profiles:profiles.results,components:components.results,runs:runs.results,employees:employees.results,members:members.results,audit:audit.results};
}
async function sha256(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function payrollApi(request:Request,db:D1Database){
 try{await ensureSetupSchema(db);if(request.method==="GET")return Response.json(await payrollSnapshot(db));if(request.method!=="POST")return Response.json({error:"Método não permitido."},{status:405});
 const body=await request.json() as Record<string,string>,created=new Date().toISOString(),recordId=uid(),actor=request.headers.get("x-openai-user-email")||"utilizador autenticado";let summary="",action="CREATE";
 if(body.type==="salaryProfile"){
  if(!body.employeeId||!body.currency?.match(/^[A-Za-z]{3}$/)||!/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom||""))return Response.json({error:"Colaborador, moeda e vigência são obrigatórios."},{status:400});
  if(await db.prepare("SELECT id FROM salary_profiles WHERE tenant_id=? AND employee_id=? AND status='Ativo'").bind(TENANT,body.employeeId).first())return Response.json({error:"O colaborador já possui um perfil salarial ativo."},{status:409});
  const base=parseMinor(body.baseAmount);summary="Perfil salarial criado";await db.prepare("INSERT INTO salary_profiles (id,tenant_id,employee_id,currency,periodicity,base_minor,effective_from,effective_to,dimension_member_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(recordId,TENANT,body.employeeId,body.currency.toUpperCase(),body.periodicity||"Mensal",base,body.effectiveFrom,body.effectiveTo||null,body.dimensionMemberId||null,"Ativo",created).run();
 }else if(body.type==="payrollComponent"){
  if(!body.employeeId||!body.code?.trim()||!body.name?.trim()||!['Earning','Deduction','EmployerCost'].includes(body.category)||!['Fixed','Percentage'].includes(body.method))return Response.json({error:"Preencha colaborador, código, nome, categoria e método."},{status:400});
  if(await db.prepare("SELECT id FROM payroll_components WHERE tenant_id=? AND code=?").bind(TENANT,body.code.trim().toUpperCase()).first())return Response.json({error:"Já existe um componente com este código."},{status:409});
  const value=body.method==="Fixed"?parseMinor(body.value):null,rate=body.method==="Percentage"?Math.round(Number(body.value.replace(",","."))*100):null;if(rate!==null&&(!Number.isInteger(rate)||rate<0||rate>100000))return Response.json({error:"Percentagem inválida."},{status:400});
  summary=`Componente ${body.name.trim()} criado`;await db.batch([db.prepare("INSERT INTO payroll_components (id,tenant_id,code,name,category,method,value_minor,rate_bps,calculation_order,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(recordId,TENANT,body.code.trim().toUpperCase(),body.name.trim(),body.category,body.method,value,rate,Number(body.calculationOrder)||100,"Ativo",created),db.prepare("INSERT INTO payroll_assignments (id,tenant_id,employee_id,component_id,created_at) VALUES (?,?,?,?,?)").bind(uid(),TENANT,body.employeeId,recordId,created)]);
 }else if(body.type==="generatePayrollRun"){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period||"")||!body.currency?.match(/^[A-Za-z]{3}$/))return Response.json({error:"Período e moeda são obrigatórios."},{status:400});
  if(await db.prepare("SELECT id FROM payroll_runs WHERE tenant_id=? AND period=? AND currency=?").bind(TENANT,body.period,body.currency.toUpperCase()).first())return Response.json({error:"Já existe um processamento para este período e moeda."},{status:409});
  const profiles=await db.prepare("SELECT p.*,e.id AS employee_id FROM salary_profiles p JOIN employees e ON e.id=p.employee_id WHERE p.tenant_id=? AND p.status='Ativo' AND p.currency=? AND p.effective_from<=? AND (p.effective_to IS NULL OR p.effective_to>=?) AND e.status='Ativo'").bind(TENANT,body.currency.toUpperCase(),`${body.period}-31`,`${body.period}-01`).all<Record<string,unknown>>();if(!profiles.results.length)return Response.json({error:"Não existem perfis salariais elegíveis."},{status:409});
  let grossTotal=0,dedTotal=0,employerTotal=0,netTotal=0;const statements=[] as D1PreparedStatement[];
  for(const p of profiles.results){const employeeId=String(p.employee_id),base=Number(p.base_minor),comps=await db.prepare("SELECT c.* FROM payroll_components c JOIN payroll_assignments a ON a.component_id=c.id WHERE a.tenant_id=? AND a.employee_id=? AND c.status='Ativo' ORDER BY c.calculation_order,c.code").bind(TENANT,employeeId).all<Record<string,unknown>>();let gross=base,deductions=0,employer=0;const inputs=[] as Record<string,unknown>[];for(const c of comps.results){const amount=c.method==="Fixed"?Number(c.value_minor):Math.trunc((base*Number(c.rate_bps)+5000)/10000);if(c.category==="Earning")gross+=amount;else if(c.category==="Deduction")deductions+=amount;else employer+=amount;inputs.push({code:c.code,category:c.category,method:c.method,amountMinor:amount})}const net=gross-deductions,snapshot=JSON.stringify({employeeId,baseMinor:base,components:inputs});const hash=await sha256(snapshot);grossTotal+=gross;dedTotal+=deductions;employerTotal+=employer;netTotal+=net;statements.push(db.prepare("INSERT INTO payroll_run_lines (id,tenant_id,run_id,employee_id,base_minor,gross_minor,deduction_minor,employer_minor,net_minor,calculation_hash,input_snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(uid(),TENANT,recordId,employeeId,base,gross,deductions,employer,net,hash,snapshot,created));}
  statements.unshift(db.prepare("INSERT INTO payroll_runs (id,tenant_id,period,currency,status,employee_count,gross_minor,deduction_minor,employer_minor,net_minor,closed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(recordId,TENANT,body.period,body.currency.toUpperCase(),"Rascunho",profiles.results.length,grossTotal,dedTotal,employerTotal,netTotal,null,created));await db.batch(statements);summary=`Payroll ${body.period} calculado para ${profiles.results.length} colaborador(es)`;
 }else if(body.type==="transitionPayrollRun"){
  const run=await db.prepare("SELECT status,period FROM payroll_runs WHERE id=? AND tenant_id=?").bind(body.runId,TENANT).first<{status:string,period:string}>();if(!run)return Response.json({error:"Processamento não encontrado."},{status:404});const next:{[key:string]:string}={Rascunho:"Validado",Validado:"Aprovado",Aprovado:"Fechado"};if(!next[run.status])return Response.json({error:"O processamento já está fechado."},{status:409});await db.prepare("UPDATE payroll_runs SET status=?,closed_at=? WHERE id=? AND tenant_id=?").bind(next[run.status],next[run.status]==="Fechado"?created:null,body.runId,TENANT).run();summary=`Payroll ${run.period}: ${next[run.status]}`;action=next[run.status].toUpperCase();
 }else return Response.json({error:"Operação não suportada."},{status:400});
 await db.prepare("INSERT INTO audit_events (id,tenant_id,action,entity_type,entity_id,actor,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),TENANT,action,body.type==="transitionPayrollRun"?"payrollRun":body.type,body.runId||recordId,actor,summary,created).run();return Response.json(await payrollSnapshot(db),{status:201});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Erro de payroll."},{status:500})}
}

async function workforceSnapshot(db:D1Database,url:URL){const period=url.searchParams.get("period")||"2026-08",currency=(url.searchParams.get("currency")||"AOA").toUpperCase(),version=url.searchParams.get("version")||"";const [runs,postings,versions,summary,audit]=await Promise.all([
 db.prepare("SELECT r.*,COUNT(w.id) AS posting_count FROM payroll_runs r LEFT JOIN workforce_cost_postings w ON w.run_id=r.id AND w.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status='Fechado' GROUP BY r.id ORDER BY r.period DESC").bind(TENANT).all(),
 db.prepare("SELECT w.*,e.first_name||' '||e.last_name AS employee_name,e.employee_number,o.name AS organization_name,m.name AS dimension_member_name FROM workforce_cost_postings w JOIN employees e ON e.id=w.employee_id JOIN organizations o ON o.id=w.organization_id LEFT JOIN dimension_members m ON m.id=w.dimension_member_id WHERE w.tenant_id=? AND w.period=? AND w.currency=? ORDER BY employee_name").bind(TENANT,period,currency).all(),
 db.prepare("SELECT id,name,status,fiscal_year FROM budget_versions WHERE tenant_id=? ORDER BY fiscal_year DESC,created_at DESC").bind(TENANT).all(),
 db.prepare("SELECT COALESCE((SELECT SUM(total_minor) FROM workforce_cost_postings WHERE tenant_id=? AND period=? AND currency=?),0) AS actual_minor,COALESCE((SELECT SUM(amount_minor) FROM performance_entries WHERE tenant_id=? AND period=? AND currency=? AND scenario='Budget' AND version_id=? AND line_code='WORKFORCE'),0) AS budget_minor").bind(TENANT,period,currency,TENANT,period,currency,version).first(),
 db.prepare("SELECT * FROM audit_events WHERE tenant_id=? AND entity_type='workforceCost' ORDER BY created_at DESC LIMIT 6").bind(TENANT).all(),
]);const actual=Number(summary?.actual_minor||0),budget=Number(summary?.budget_minor||0),variance=actual-budget;return{period,currency,runs:runs.results,postings:postings.results,versions:versions.results,summary:{actualMinor:actual,budgetMinor:budget,varianceMinor:variance,varianceBps:budget?Math.trunc(variance*10000/budget):null},audit:audit.results}}
async function workforceApi(request:Request,db:D1Database){try{await ensureSetupSchema(db);const url=new URL(request.url);if(request.method==="GET")return Response.json(await workforceSnapshot(db,url));if(request.method!=="POST")return Response.json({error:"Método não permitido."},{status:405});const body=await request.json() as Record<string,string>,created=new Date().toISOString(),actor=request.headers.get("x-openai-user-email")||"utilizador autenticado";
 if(body.type!=="postRun"||!body.runId)return Response.json({error:"Operação não suportada."},{status:400});const run=await db.prepare("SELECT * FROM payroll_runs WHERE id=? AND tenant_id=?").bind(body.runId,TENANT).first<Record<string,unknown>>();if(!run||run.status!=="Fechado")return Response.json({error:"Apenas Payroll Runs fechados podem ser transferidos."},{status:409});if(await db.prepare("SELECT id FROM workforce_cost_postings WHERE tenant_id=? AND run_id=?").bind(TENANT,body.runId).first())return Response.json({error:"Este Payroll Run já foi transferido. A operação é idempotente."},{status:409});
 const lines=await db.prepare("SELECT l.*,e.organization_id,p.dimension_member_id FROM payroll_run_lines l JOIN employees e ON e.id=l.employee_id LEFT JOIN salary_profiles p ON p.employee_id=l.employee_id AND p.tenant_id=l.tenant_id AND p.status='Ativo' WHERE l.tenant_id=? AND l.run_id=?").bind(TENANT,body.runId).all<Record<string,unknown>>();if(!lines.results.length)return Response.json({error:"O processamento não possui linhas de cálculo."},{status:409});const statements=[] as D1PreparedStatement[];for(const l of lines.results){const postingId=uid(),total=Number(l.gross_minor)+Number(l.employer_minor);statements.push(db.prepare("INSERT INTO workforce_cost_postings (id,tenant_id,run_id,run_line_id,employee_id,organization_id,dimension_member_id,period,currency,gross_minor,employer_minor,total_minor,source_hash,posted_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(postingId,TENANT,body.runId,l.id,l.employee_id,l.organization_id,l.dimension_member_id||null,run.period,run.currency,l.gross_minor,l.employer_minor,total,l.calculation_hash,created,created));statements.push(db.prepare("INSERT INTO performance_entries (id,tenant_id,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(uid(),TENANT,l.organization_id,run.period,"Actual",null,run.currency,"WORKFORCE","Custo da força de trabalho",l.dimension_member_id||null,total,"Payroll",created));}statements.push(db.prepare("INSERT INTO audit_events (id,tenant_id,action,entity_type,entity_id,actor,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),TENANT,"POST","workforceCost",body.runId,actor,`Payroll ${run.period} transferido para Workforce Cost`,created));await db.batch(statements);return Response.json(await workforceSnapshot(db,new URL(`${url.origin}/api/workforce?period=${run.period}&currency=${run.currency}&version=${encodeURIComponent(body.versionId||"")}`)),{status:201});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Erro de Workforce Cost."},{status:500})}}

async function dashboardApi(request:Request,db:D1Database){try{await ensureSetupSchema(db);const u=new URL(request.url),period=u.searchParams.get("period")||"2026-08",currency=(u.searchParams.get("currency")||"AOA").toUpperCase(),version=u.searchParams.get("version")||"";const [versions,totals,trend,drivers,entries,coverage,headcount,payroll]=await Promise.all([
 db.prepare("SELECT id,name,status,fiscal_year FROM budget_versions WHERE tenant_id=? ORDER BY fiscal_year DESC,created_at DESC").bind(TENANT).all(),
 db.prepare("SELECT COALESCE(SUM(CASE WHEN scenario='Actual' THEN amount_minor ELSE 0 END),0) actual_minor,COALESCE(SUM(CASE WHEN scenario='Budget' AND version_id=? THEN amount_minor ELSE 0 END),0) budget_minor,COALESCE(SUM(CASE WHEN scenario='Actual' AND line_code='WORKFORCE' THEN amount_minor ELSE 0 END),0) workforce_minor FROM performance_entries WHERE tenant_id=? AND period=? AND currency=?").bind(version,TENANT,period,currency).first<Record<string,unknown>>(),
 db.prepare("SELECT period,COALESCE(SUM(CASE WHEN scenario='Actual' THEN amount_minor ELSE 0 END),0) actual_minor,COALESCE(SUM(CASE WHEN scenario='Budget' AND version_id=? THEN amount_minor ELSE 0 END),0) budget_minor FROM performance_entries WHERE tenant_id=? AND currency=? AND period<=? GROUP BY period ORDER BY period DESC LIMIT 6").bind(version,TENANT,currency,period).all(),
 db.prepare("SELECT line_code,MAX(line_name) line_name,COALESCE(SUM(CASE WHEN scenario='Actual' THEN amount_minor ELSE 0 END),0) actual_minor,COALESCE(SUM(CASE WHEN scenario='Budget' AND version_id=? THEN amount_minor ELSE 0 END),0) budget_minor FROM performance_entries WHERE tenant_id=? AND period=? AND currency=? GROUP BY line_code ORDER BY line_code").bind(version,TENANT,period,currency).all<Record<string,unknown>>(),
 db.prepare("SELECT p.*,o.name organization_name,m.name dimension_member_name FROM performance_entries p JOIN organizations o ON o.id=p.organization_id LEFT JOIN dimension_members m ON m.id=p.dimension_member_id WHERE p.tenant_id=? AND p.period=? AND p.currency=? AND (p.scenario='Actual' OR (p.scenario='Budget' AND p.version_id=?)) ORDER BY p.created_at DESC").bind(TENANT,period,currency,version).all(),
 db.prepare("SELECT COUNT(DISTINCT organization_id) organizations,COUNT(DISTINCT source) sources,MAX(created_at) latest_at FROM performance_entries WHERE tenant_id=? AND period=? AND currency=?").bind(TENANT,period,currency).first<Record<string,unknown>>(),
 db.prepare("SELECT COUNT(*) total FROM employees WHERE tenant_id=? AND status='Ativo'").bind(TENANT).first<Record<string,unknown>>(),
 db.prepare("SELECT period,status FROM payroll_runs WHERE tenant_id=? AND currency=? AND period<=? ORDER BY period DESC,created_at DESC LIMIT 1").bind(TENANT,currency,period).first(),
 ]);const actual=Number(totals?.actual_minor||0),budget=Number(totals?.budget_minor||0),variance=actual-budget;return Response.json({versions:versions.results,summary:{actualMinor:actual,budgetMinor:budget,varianceMinor:variance,varianceBps:budget?Math.trunc(variance*10000/budget):null,workforceMinor:Number(totals?.workforce_minor||0),headcount:Number(headcount?.total||0)},trend:[...trend.results].reverse(),drivers:drivers.results.map(x=>({...x,actual_minor:Number(x.actual_minor),budget_minor:Number(x.budget_minor),variance_minor:Number(x.actual_minor)-Number(x.budget_minor)})),entries:entries.results,coverage:{organizations:Number(coverage?.organizations||0),sources:Number(coverage?.sources||0),latestAt:coverage?.latest_at||null},payroll:payroll||null})}catch(error){return Response.json({error:error instanceof Error?error.message:"Erro de dashboard."},{status:500})}}

async function managementReportApi(request:Request,db:D1Database){try{await ensureSetupSchema(db);const u=new URL(request.url);if(request.method==="GET"){const id=u.searchParams.get("id");if(id){const row=await db.prepare("SELECT * FROM management_reports WHERE tenant_id=? AND id=?").bind(TENANT,id).first<Record<string,unknown>>();if(!row)return Response.json({error:"Relatório não encontrado."},{status:404});return Response.json({...row,payload:JSON.parse(String(row.payload_json))})}const [reports,versions]=await Promise.all([db.prepare("SELECT id,report_number,title,template,period,currency,status,input_hash,created_by,created_at FROM management_reports WHERE tenant_id=? ORDER BY report_number DESC LIMIT 20").bind(TENANT).all(),db.prepare("SELECT id,name,status,fiscal_year FROM budget_versions WHERE tenant_id=? ORDER BY fiscal_year DESC,created_at DESC").bind(TENANT).all()]);return Response.json({reports:reports.results,versions:versions.results})}if(request.method!=="POST")return Response.json({error:"Método não permitido."},{status:405});const b=await request.json() as Record<string,string>,period=b.period||"",currency=(b.currency||"").toUpperCase(),version=b.versionId||"";if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!/^[A-Z]{3}$/.test(currency)||!b.title?.trim())return Response.json({error:"Título, período e moeda válidos são obrigatórios."},{status:400});const [totals,drivers,coverage,versionRow,last]=await Promise.all([
db.prepare("SELECT COALESCE(SUM(CASE WHEN scenario='Actual' THEN amount_minor ELSE 0 END),0) actual,COALESCE(SUM(CASE WHEN scenario='Budget' AND version_id=? THEN amount_minor ELSE 0 END),0) budget,COALESCE(SUM(CASE WHEN scenario='Actual' AND line_code='WORKFORCE' THEN amount_minor ELSE 0 END),0) workforce FROM performance_entries WHERE tenant_id=? AND period=? AND currency=?").bind(version,TENANT,period,currency).first<Record<string,unknown>>(),
db.prepare("SELECT line_code,MAX(line_name) line_name,COALESCE(SUM(CASE WHEN scenario='Actual' THEN amount_minor ELSE 0 END),0) actual,COALESCE(SUM(CASE WHEN scenario='Budget' AND version_id=? THEN amount_minor ELSE 0 END),0) budget FROM performance_entries WHERE tenant_id=? AND period=? AND currency=? GROUP BY line_code").bind(version,TENANT,period,currency).all<Record<string,unknown>>(),
db.prepare("SELECT COUNT(*) entries,COUNT(DISTINCT organization_id) organizations,COUNT(DISTINCT source) sources,MAX(created_at) latest_at FROM performance_entries WHERE tenant_id=? AND period=? AND currency=?").bind(TENANT,period,currency).first<Record<string,unknown>>(),
version?db.prepare("SELECT name,status FROM budget_versions WHERE tenant_id=? AND id=?").bind(TENANT,version).first<Record<string,unknown>>():Promise.resolve(null),
db.prepare("SELECT COALESCE(MAX(report_number),0) number FROM management_reports WHERE tenant_id=?").bind(TENANT).first<Record<string,unknown>>()]);const actual=Number(totals?.actual||0),budget=Number(totals?.budget||0),variance=actual-budget,rows=drivers.results.map(x=>({lineCode:x.line_code,lineName:x.line_name,actualMinor:Number(x.actual),budgetMinor:Number(x.budget),varianceMinor:Number(x.actual)-Number(x.budget)})).sort((a,b)=>Math.abs(b.varianceMinor)-Math.abs(a.varianceMinor)),cause=rows[0]||null,impact=variance===0?"Resultado alinhado com o Budget.":variance>0?"O Actual está acima do Budget selecionado.":"O Actual está abaixo do Budget selecionado.",recommendation=!budget?"Configurar uma base Budget comparável antes da decisão final.":cause?.lineCode==="WORKFORCE"?"Rever a composição e a alocação do Workforce Cost no módulo de Análises.":"Rever os lançamentos e pressupostos da principal linha no Planeamento.";const payload={generatedAt:new Date().toISOString(),parameters:{period,currency,versionId:version,versionName:String(versionRow?.name||"Sem versão"),template:b.template||"Executivo"},result:{actualMinor:actual,budgetMinor:budget,varianceMinor:variance,varianceBps:budget?Math.trunc(variance*10000/budget):null,workforceMinor:Number(totals?.workforce||0)},cause,impact,perspective:`${Number(coverage?.organizations||0)} organização(ões), ${Number(coverage?.sources||0)} fonte(s) e ${Number(coverage?.entries||0)} lançamento(s) suportam esta versão.`,recommendation,drivers:rows,coverage};const snapshot=JSON.stringify(payload),hash=await sha256(snapshot),id=uid(),created=new Date().toISOString(),number=Number(last?.number||0)+1,actor=request.headers.get("x-openai-user-email")||"utilizador autenticado";await db.batch([db.prepare("INSERT INTO management_reports (id,tenant_id,created_at,report_number,title,template,period,currency,budget_version_id,status,payload_json,input_hash,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,TENANT,created,number,b.title.trim(),b.template||"Executivo",period,currency,version||null,"Emitido",snapshot,hash,actor),db.prepare("INSERT INTO audit_events (id,tenant_id,action,entity_type,entity_id,actor,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),TENANT,"GENERATE","managementReport",id,actor,`Relatório de gestão v${number} emitido`,created)]);return Response.json({id,report_number:number,title:b.title.trim(),template:b.template||"Executivo",period,currency,status:"Emitido",input_hash:hash,created_by:actor,created_at:created,payload},{status:201})}catch(error){return Response.json({error:error instanceof Error?error.message:"Erro de relatório."},{status:500})}}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/setup") return setupApi(request, env.DB);
    if (url.pathname === "/api/performance") return performanceApi(request, env.DB);
    if (url.pathname === "/api/payroll") return payrollApi(request, env.DB);
    if (url.pathname === "/api/workforce") return workforceApi(request, env.DB);
    if (url.pathname === "/api/dashboard") return dashboardApi(request, env.DB);
    if (url.pathname === "/api/management-reports") return managementReportApi(request, env.DB);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
