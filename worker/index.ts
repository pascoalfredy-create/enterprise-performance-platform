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
