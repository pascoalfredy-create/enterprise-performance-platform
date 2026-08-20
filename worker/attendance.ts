import { classifyDataError } from "../lib/api-error";
type Security={tenantId:string;organizationId:string|null;email:string;role:string};
const uid=()=>crypto.randomUUID();
const date=/^\d{4}-\d{2}-\d{2}$/,period=/^\d{4}-(0[1-9]|1[0-2])$/,time=/^([01]\d|2[0-3]):[0-5]\d$/;
const minutes=(value:string)=>{const [h,m]=value.split(":").map(Number);return h*60+m};
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const failure=(error:unknown)=>{const x=classifyDataError(error,"Não foi possível processar assiduidade.");return Response.json({error:x.message,code:x.code},{status:x.status})};
export async function attendanceApi(request:Request,db:D1Database,s:Security){
 try{
  const tenant=s.tenantId,scope=s.organizationId,now=new Date().toISOString();
  const snapshot=async()=>{const [shifts,employees,assignments,entries,timesheets]=await Promise.all([
   db.prepare("SELECT * FROM attendance_shifts WHERE tenant_id=? ORDER BY status,code").bind(tenant).all(),
   db.prepare("SELECT id,employee_number,first_name||' '||last_name employee_name,organization_id FROM employees WHERE tenant_id=? AND (? IS NULL OR organization_id=?) AND status='Ativo' ORDER BY employee_number").bind(tenant,scope,scope).all(),
   db.prepare("SELECT a.*,e.employee_number,e.first_name||' '||e.last_name employee_name,s.code shift_code,s.name shift_name FROM attendance_assignments a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id JOIN attendance_shifts s ON s.id=a.shift_id AND s.tenant_id=a.tenant_id WHERE a.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY a.created_at DESC").bind(tenant,scope,scope).all(),
   db.prepare("SELECT a.*,e.employee_number,e.first_name||' '||e.last_name employee_name FROM attendance_entries a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id WHERE a.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY a.work_date DESC,a.created_at DESC LIMIT 100").bind(tenant,scope,scope).all(),
   db.prepare("SELECT t.*,e.employee_number,e.first_name||' '||e.last_name employee_name FROM attendance_timesheets t JOIN employees e ON e.id=t.employee_id AND e.tenant_id=t.tenant_id WHERE t.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY t.period DESC,t.created_at DESC").bind(tenant,scope,scope).all()
  ]);return{shifts:shifts.results,employees:employees.results,assignments:assignments.results,entries:entries.results,timesheets:timesheets.results}};
  if(request.method==="GET")return Response.json(await snapshot());
  if(request.method!=="POST")return Response.json({error:"Método não permitido."},{status:405});
  const b=await request.json() as Record<string,string>;let id=uid(),action="CREATE",summary="";
  if(b.type==="createShift"){
   if(scope)return Response.json({error:"A configuração de turnos exige âmbito de todo o tenant."},{status:403});
   if(!b.code?.trim()||!b.name?.trim()||!time.test(b.startTime||"")||!time.test(b.endTime||""))return Response.json({error:"Código, nome e horários válidos são obrigatórios."},{status:400});
   const start=minutes(b.startTime),end=minutes(b.endTime),breakM=Number(b.breakMinutes||0),span=(end>start?end-start:1440-start+end)-breakM;
   if(!Number.isInteger(breakM)||breakM<0||span<=0)return Response.json({error:"A pausa deve preservar uma duração positiva do turno."},{status:400});
   await db.prepare("INSERT INTO attendance_shifts VALUES (?,?,?,?,?,?,?,?,'Ativo',?,?)").bind(id,tenant,b.code.trim().toUpperCase(),b.name.trim(),start,end,breakM,span,s.email,now).run();summary=`Turno ${b.code.trim().toUpperCase()} criado com ${span} minutos`;
  }else if(b.type==="assignShift"){
   const employee=await db.prepare("SELECT id FROM employees WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id=?) AND status='Ativo'").bind(b.employeeId,tenant,scope,scope).first();
   if(!employee||!b.shiftId||!date.test(b.effectiveFrom||""))return Response.json({error:"Colaborador, turno e vigência são obrigatórios."},{status:400});
   await db.prepare("UPDATE attendance_assignments SET status='Encerrada',effective_to=? WHERE tenant_id=? AND employee_id=? AND status='Ativa'").bind(b.effectiveFrom,tenant,b.employeeId).run();
   await db.prepare("INSERT INTO attendance_assignments VALUES (?,?,?,?,?,NULL,'Ativa',?,?)").bind(id,tenant,b.employeeId,b.shiftId,b.effectiveFrom,s.email,now).run();summary="Turno atribuído ao colaborador";
  }else if(b.type==="clockIn"){
   if(!date.test(b.workDate||"")||!time.test(b.clockIn||""))return Response.json({error:"Data e hora de entrada válidas são obrigatórias."},{status:400});
   const assignment=await db.prepare("SELECT s.scheduled_minutes FROM attendance_assignments a JOIN attendance_shifts s ON s.id=a.shift_id AND s.tenant_id=a.tenant_id JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.employee_id=? AND (? IS NULL OR e.organization_id=?) AND a.status='Ativa' AND a.effective_from<=? ORDER BY a.effective_from DESC LIMIT 1").bind(tenant,b.employeeId,scope,scope,b.workDate).first<Record<string,unknown>>();
   if(!assignment)return Response.json({error:"Não existe turno ativo para o colaborador nesta data."},{status:409});
   await db.prepare("INSERT INTO attendance_entries VALUES (?,?,?,?,?,NULL,?,NULL,?,NULL,NULL,?,?,?)").bind(id,tenant,b.employeeId,b.workDate,b.clockIn,b.source||"Manual",assignment.scheduled_minutes,b.note?.trim()||null,s.email,now).run();summary=`Entrada registada em ${b.workDate}`;
  }else if(b.type==="clockOut"){
   const row=await db.prepare("SELECT * FROM attendance_entries WHERE id=? AND tenant_id=? AND clock_out IS NULL").bind(b.entryId,tenant).first<Record<string,unknown>>();
   if(!row||!time.test(b.clockOut||""))return Response.json({error:"Marcação aberta e hora de saída válida são obrigatórias."},{status:400});
   const start=minutes(String(row.clock_in)),end=minutes(b.clockOut),worked=end>=start?end-start:1440-start+end,scheduled=Number(row.scheduled_minutes),overtime=Math.max(0,worked-scheduled);
   if(worked<=0||worked>1440)return Response.json({error:"A duração da marcação é inválida."},{status:400});
   id=b.entryId;action="CLOSE";await db.prepare("UPDATE attendance_entries SET clock_out=?,worked_minutes=?,overtime_minutes=?,exception_code=? WHERE id=? AND tenant_id=? AND clock_out IS NULL").bind(b.clockOut,worked,overtime,worked<scheduled?"DÉFICE":overtime>0?"EXTRA":null,id,tenant).run();summary=`Marcação fechada: ${worked} minutos, ${overtime} extraordinários`;
  }else if(b.type==="buildTimesheet"){
   if(!period.test(b.period||""))return Response.json({error:"Período válido é obrigatório."},{status:400});
   const employee=await db.prepare("SELECT id FROM employees WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id=?)").bind(b.employeeId,tenant,scope,scope).first();if(!employee)return Response.json({error:"Colaborador fora do âmbito autorizado."},{status:403});
   const rows=await db.prepare("SELECT id,work_date,clock_in,clock_out,worked_minutes,scheduled_minutes,overtime_minutes FROM attendance_entries WHERE tenant_id=? AND employee_id=? AND substr(work_date,1,7)=? AND clock_out IS NOT NULL ORDER BY work_date").bind(tenant,b.employeeId,b.period).all<Record<string,unknown>>();
   if(!rows.results.length)return Response.json({error:"Não existem marcações fechadas para consolidar."},{status:409});
   const worked=rows.results.reduce((a,x)=>a+Number(x.worked_minutes),0),scheduled=rows.results.reduce((a,x)=>a+Number(x.scheduled_minutes),0),overtime=rows.results.reduce((a,x)=>a+Number(x.overtime_minutes),0),hash=await digest(JSON.stringify(rows.results));
   await db.prepare("INSERT INTO attendance_timesheets VALUES (?,?,?,?,'Rascunho',?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,?)").bind(id,tenant,b.employeeId,b.period,worked,scheduled,overtime,rows.results.length,hash,now).run();summary=`Timesheet ${b.period} consolidado com hash ${hash.slice(0,12)}`;
  }else if(b.type==="submitTimesheet"){
   id=b.timesheetId;action="SUBMIT";await db.prepare("UPDATE attendance_timesheets SET status='Submetido',submitted_by=?,submitted_at=? WHERE id=? AND tenant_id=? AND status='Rascunho'").bind(s.email,now,id,tenant).run();summary="Timesheet submetido para aprovação";
  }else if(b.type==="decideTimesheet"){
   const row=await db.prepare("SELECT submitted_by FROM attendance_timesheets WHERE id=? AND tenant_id=? AND status='Submetido'").bind(b.timesheetId,tenant).first<Record<string,unknown>>();
   if(!row||!["Aprovado","Rejeitado"].includes(b.decision))return Response.json({error:"Timesheet submetido e decisão válida são obrigatórios."},{status:409});
   if(String(row.submitted_by).toLowerCase()===s.email.toLowerCase())return Response.json({error:"Maker-checker: quem submete não pode decidir."},{status:403});
   if(b.decision==="Rejeitado"&&(!b.decisionNote||b.decisionNote.trim().length<5))return Response.json({error:"A rejeição exige uma justificação."},{status:400});
   id=b.timesheetId;action=b.decision==="Aprovado"?"APPROVE":"REJECT";await db.prepare("UPDATE attendance_timesheets SET status=?,decided_by=?,decided_at=?,decision_note=? WHERE id=? AND tenant_id=? AND status='Submetido'").bind(b.decision,s.email,now,b.decisionNote?.trim()||null,id,tenant).run();summary=`Timesheet ${b.decision.toLowerCase()}`;
  }else return Response.json({error:"Operação de assiduidade não suportada."},{status:400});
  await db.prepare("INSERT INTO audit_events (id,tenant_id,action,entity_type,entity_id,actor,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),tenant,action,"attendance",id,s.email,summary,now).run();return Response.json(await snapshot(),{status:201});
 }catch(error){return failure(error)}
}
