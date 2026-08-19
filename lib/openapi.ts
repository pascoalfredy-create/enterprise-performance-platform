const errors={"401":{description:"Identidade autenticada ausente"},"403":{description:"Membership ou permissão insuficiente"},"409":{description:"Conflito de estado ou idempotência"}};
function read(summary:string,tag:string){return{summary,tags:[tag],security:[{bearerAuth:[]}],responses:{"200":{description:"Operação concluída"},...errors}}}
function write(summary:string,tag:string,permission:string){return{summary,tags:[tag],security:[{bearerAuth:[]}],"x-permission":permission,requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/Command"}}}},responses:{"200":{description:"Operação concluída"},"201":{description:"Registo criado ou transição executada"},...errors}}}
export const openApiDocument={
 openapi:"3.1.0",
 info:{title:"Enterprise Performance Platform API",version:"1.0.0",description:"Contratos HTTP versionados para o primeiro vertical slice. Cálculos financeiros e salariais permanecem determinísticos e auditáveis."},
 servers:[{url:"/api/v1",description:"API estável v1"}],
 tags:["Identity","Setup","HCM","Performance","Payroll","Workforce","Reporting","Control"].map(name=>({name})),
 paths:{
  "/session":{get:read("Current security context","Identity")},
  "/tenants":{get:read("List authenticated tenant memberships","Identity"),post:write("Create tenant and root organization","Identity","setup:write")},
  "/invitations/accept":{post:{summary:"Accept a single-use tenant invitation",tags:["Identity"],security:[{bearerAuth:[]}],requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["token"],properties:{token:{type:"string",pattern:"^epi_"}}}}}},responses:{"200":{description:"Membership activated"},...errors}}},
  "/setup":{get:read("Read organizations users employees and dimensions","Setup"),post:write("Write setup","Setup","setup:write")},
  "/hcm":{get:{...read("Read employee master and contracts","HCM"),"x-permission":"hcm:read"},post:write("Create or transition employee contracts","HCM","hcm:write")},
  "/performance":{get:{...read("Read Actual and Budget","Performance"),parameters:[{$ref:"#/components/parameters/Period"},{$ref:"#/components/parameters/Currency"},{$ref:"#/components/parameters/Version"}]},post:write("Create or approve performance","Performance","performance:write")},
  "/payroll":{get:read("Read payroll foundation","Payroll"),post:write("Configure calculate or transition payroll","Payroll","payroll:write")},
  "/workforce":{get:read("Read workforce cost","Workforce"),post:write("Post closed payroll to workforce","Workforce","workforce:write")},
  "/dashboard":{get:read("Read executive dashboard","Reporting")},
  "/management-reports":{get:read("Read report versions","Reporting"),post:write("Generate immutable management report","Reporting","reports:write")},
  "/integrity":{get:{...read("Run vertical slice controls","Control"),"x-permission":"integrity:read"}},
  "/openapi.json":{get:{summary:"OpenAPI document",tags:["Control"],responses:{"200":{description:"OpenAPI 3.1 document"}}}},
 },
 components:{securitySchemes:{bearerAuth:{type:"http",scheme:"bearer",bearerFormat:"JWT",description:"Access token Supabase validado no servidor. O acesso privado interno permanece transitório até à abertura pública."}},parameters:{Period:{name:"period",in:"query",schema:{type:"string",pattern:"^\\d{4}-(0[1-9]|1[0-2])$",example:"2026-08"}},Currency:{name:"currency",in:"query",schema:{type:"string",pattern:"^[A-Z]{3}$",example:"AOA"}},Version:{name:"version",in:"query",schema:{type:"string"}}},schemas:{Command:{type:"object",required:["type"],properties:{type:{type:"string",description:"Discriminador explícito do comando"}},additionalProperties:true},Error:{type:"object",required:["error"],properties:{error:{type:"string"}}}}}
} as const;
