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
  ]);
}
async function setupSnapshot(db: D1Database) {
  const [organizations, users, employees, audit] = await Promise.all([
    db.prepare("SELECT * FROM organizations WHERE tenant_id=? ORDER BY created_at").bind(TENANT).all(),
    db.prepare("SELECT * FROM platform_users WHERE tenant_id=? ORDER BY created_at").bind(TENANT).all(),
    db.prepare("SELECT * FROM employees WHERE tenant_id=? ORDER BY created_at DESC").bind(TENANT).all(),
    db.prepare("SELECT * FROM audit_events WHERE tenant_id=? ORDER BY created_at DESC LIMIT 8").bind(TENANT).all(),
  ]);
  return { organizations: organizations.results, users: users.results, employees: employees.results, audit: audit.results };
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
    } else return Response.json({error:"Operação não suportada."},{status:400});
    await db.prepare("INSERT INTO audit_events (id,tenant_id,action,entity_type,entity_id,actor,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),TENANT,"CREATE",body.type,recordId,actor,summary,created).run();
    return Response.json(await setupSnapshot(db),{status:201});
  } catch(error) { return Response.json({error:error instanceof Error?error.message:"Erro de persistência."},{status:500}); }
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
