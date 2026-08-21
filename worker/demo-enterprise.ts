type Security={tenantId:string;email:string};
const key=(t:string,k:string)=>`demo2:${t}:${k}`;
export async function installEnterpriseDemo(db:D1Database,s:Security){
 const t=s.tenantId,now=new Date().toISOString(),actor=s.email,org=key(t,"org"),member=key(t,"member"),budget=key(t,"budget");
 const existing=await db.prepare("SELECT * FROM demo_enterprise_installations WHERE tenant_id=?").bind(t).first();
 if(existing)return existing;
 const e1=key(t,"employee1"),e2=key(t,"employee2"),e3=key(t,"employee3"),manager="gestor.demo@calculosutil.ao",analyst="analista.demo@calculosutil.ao";
 const q=(sql:string,...v:unknown[])=>db.prepare(sql).bind(...v), statements:D1PreparedStatement[]=[];
 statements.push(
  q("INSERT OR IGNORE INTO organizations (id,tenant_id,created_at,code,name,kind,currency,status) VALUES (?,?,?,?,?,?,?,?)",org,t,now,"CS-DEMO","Cálculo Sutil · Operações","Empresa","AOA","Ativa"),
  q("INSERT OR IGNORE INTO financial_dimensions (id,tenant_id,created_at,code,name,description,status) VALUES (?,?,?,?,?,?,?)",key(t,"dim"),t,now,"DEPT","Departamento","Estrutura funcional da demonstração","Ativa"),
  q("INSERT OR IGNORE INTO dimension_members (id,tenant_id,created_at,dimension_id,code,name,parent_id,status) VALUES (?,?,?,?,?,?,?,?)",member,t,now,key(t,"dim"),"FIN","Finanças e Administração",null,"Ativo"),
  q("INSERT OR IGNORE INTO platform_users (id,tenant_id,created_at,name,email,role,organization_id,status) VALUES (?,?,?,?,?,?,?,?)",key(t,"user-manager"),t,now,"Gestor Demonstração",manager,"Gestor",org,"Ativo"),
  q("INSERT OR IGNORE INTO platform_users (id,tenant_id,created_at,name,email,role,organization_id,status) VALUES (?,?,?,?,?,?,?,?)",key(t,"user-analyst"),t,now,"Analista Demonstração",analyst,"Financeiro",org,"Ativo")
 );
 const people=[[e1,"CS-101","Ana","Manuel","Controller",58000000],[e2,"CS-102","Mateus","Joaquim","Analista Financeiro",39000000],[e3,"CS-103","Lúcia","Pedro","HR Business Partner",42000000]] as const;
 for(const [eid,no,first,last,job,base] of people){statements.push(
  q("INSERT OR IGNORE INTO employees (id,tenant_id,created_at,employee_number,first_name,last_name,organization_id,job_title,hire_date,status) VALUES (?,?,?,?,?,?,?,?,?,?)",eid,t,now,no,first,last,org,job,"2025-01-06","Ativo"),
  q("INSERT OR IGNORE INTO employee_contracts (id,tenant_id,created_at,employee_id,contract_number,contract_type,start_date,end_date,work_schedule,weekly_minutes,country_pack,status,activated_at,ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,`contract-${no}`),t,now,eid,`CT-${no}`,"Sem termo","2025-01-06",null,"Segunda a sexta · 08:00–17:00",2400,"AO-DEMO","Rascunho",null,null),
  q("UPDATE employee_contracts SET status='Ativo',activated_at=? WHERE id=? AND status='Rascunho'",now,key(t,`contract-${no}`)),
  q("INSERT OR IGNORE INTO salary_profiles (id,tenant_id,created_at,employee_id,currency,periodicity,base_minor,effective_from,effective_to,dimension_member_id,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)",key(t,`salary-${no}`),t,now,eid,"AOA","Mensal",base,"2026-01-01",null,member,"Ativo")
 )}
 statements.push(q("INSERT OR IGNORE INTO budget_versions (id,tenant_id,created_at,name,fiscal_year,status,approved_at) VALUES (?,?,?,?,?,?,?)",budget,t,now,"Budget Executivo 2026",2026,"Rascunho",null));
 const periods=["2026-03","2026-04","2026-05","2026-06","2026-07","2026-08"], lines=[
  ["REVENUE","Receita",[1720000000,1810000000,1900000000,1980000000,2070000000,2180000000],[1700000000,1800000000,1880000000,1970000000,2050000000,2140000000]],
  ["COGS","Custos diretos",[690000000,710000000,735000000,755000000,790000000,815000000],[680000000,700000000,725000000,750000000,775000000,800000000]],
  ["OPEX","Custos operacionais",[430000000,445000000,460000000,475000000,492000000,510000000],[420000000,435000000,450000000,465000000,480000000,495000000]],
  ["CAPEX","CAPEX",[120000000,80000000,95000000,135000000,70000000,110000000],[100000000,100000000,100000000,100000000,100000000,100000000]],
  ["CASH","Caixa disponível",[760000000,815000000,860000000,920000000,980000000,1050000000],[740000000,790000000,835000000,890000000,945000000,1000000000]]
 ] as const;
 for(const [code,name,actual,bud] of lines)for(let i=0;i<periods.length;i++)statements.push(
  q("INSERT OR IGNORE INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,`actual-${code}-${i}`),t,now,org,periods[i],"Actual",null,"AOA",code,name,member,actual[i],"ERP Demo"),
  q("INSERT OR IGNORE INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,`budget-${code}-${i}`),t,now,org,periods[i],"Budget",budget,"AOA",code,name,member,bud[i],"FP&A Demo")
 );
 statements.push(q("UPDATE budget_versions SET status='Aprovado',approved_at=? WHERE id=? AND status='Rascunho'",now,budget));
 const absence=key(t,"absence"),cycle=key(t,"cycle"),goal=key(t,"goal"),review=key(t,"review"),framework=key(t,"competency"),forecast=key(t,"forecast");
 statements.push(
  q("INSERT OR IGNORE INTO hcm_absence_types VALUES (?,?,?,?,?,?,?,?,?)",absence,t,"FERIAS","Férias","Dias",1,1,"Ativo",now),
  q("INSERT OR IGNORE INTO hcm_absence_balances VALUES (?,?,?,?,?,?,?,?)",key(t,"absence-balance"),t,e1,absence,2026,105600,2400,now),
  q("INSERT OR IGNORE INTO hcm_absence_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"absence-request"),t,e1,absence,"2026-09-07","2026-09-11",2400,"Descanso anual","Aprovado",analyst,now,manager,now,"Plano de cobertura validado"),
  q("INSERT OR IGNORE INTO performance_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"action"),t,org,"2026-08","AOA","OPEX","Actual vs Budget","Reduzir despesas administrativas","Renegociar contratos e controlar compras",manager,"2026-09-30","Alta","Em curso",actor,now,now,null,null),
  q("INSERT OR IGNORE INTO planning_versions VALUES (?,?,?,?,?,?,?,?,?,?,?)",forecast,t,"Forecast Q4 2026","Forecast",2026,budget,"Rascunho",actor,now,null,null)
 );
 for(let m=9;m<=12;m++)for(const [code,name,,bud] of lines.slice(0,4))statements.push(q("INSERT OR IGNORE INTO planning_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,`forecast-${code}-${m}`),t,forecast,org,`2026-${String(m).padStart(2,"0")}`,"AOA",code,name,member,Math.round(bud[5]*(1+(m-8)*.012)),"Crescimento moderado com disciplina de custos",actor,now));
 statements.push(q("UPDATE planning_versions SET status='Aprovado',approved_by=?,approved_at=? WHERE id=? AND status='Rascunho'",manager,now,forecast));
 statements.push(
  q("INSERT OR IGNORE INTO performance_cycles VALUES (?,?,?,?,?,?,?,?,?,?,?)",cycle,t,"Ciclo de Performance 2026","2026-01-01","2026-12-31","Rascunho",actor,now,null,null,null),
  q("INSERT OR IGNORE INTO performance_goals VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",goal,t,cycle,org,analyst,"Aumentar margem operacional","Melhorar mix e eficiência","Margem operacional","%","Aumentar",2800,3400,100,10000,"Rascunho",actor,now,null),
  q("UPDATE performance_cycles SET status='Ativo',activated_by=?,activated_at=? WHERE id=? AND status='Rascunho'",manager,now,cycle),
  q("INSERT OR IGNORE INTO performance_goal_checkins VALUES (?,?,?,?,?,?,?,?)",key(t,"checkin"),t,goal,3250,"Execução acima do plano","Dashboard financeiro agosto",analyst,now),
  q("INSERT OR IGNORE INTO performance_reviews VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",review,t,cycle,org,analyst,manager,"Finalizada",8300,"Boa execução e colaboração",now,9500,8600,"Superou objetivos",now,8800,"Calibração do comité",9150,actor,now,actor,now),
  q("INSERT OR IGNORE INTO competency_frameworks VALUES (?,?,?,?,?,?,?,?,?)",framework,t,"Liderança e Performance","Competências transversais","Rascunho",actor,now,null,null),
  q("INSERT OR IGNORE INTO competency_definitions VALUES (?,?,?,?,?,?,?,?,?,?)",key(t,"competency1"),t,framework,"ANALYTICS","Pensamento analítico","Decisões baseadas em evidência","Core",5000,"Ativa",now),
  q("INSERT OR IGNORE INTO competency_definitions VALUES (?,?,?,?,?,?,?,?,?,?)",key(t,"competency2"),t,framework,"LEADERSHIP","Liderança","Mobilização e responsabilização","Liderança",5000,"Ativa",now),
  q("UPDATE competency_frameworks SET status='Ativo',activated_by=?,activated_at=? WHERE id=? AND status='Rascunho'",actor,now,framework),
  q("INSERT OR IGNORE INTO feedback_360_rounds VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"round360"),t,review,framework,"2026-09-30","Confidencial","Fechado",actor,now,actor,now,actor,now,8750)
 );
 const rate=key(t,"rates"),cons=key(t,"consolidation"),model=key(t,"model"),modelLine=key(t,"model-line");
 statements.push(
  q("INSERT OR IGNORE INTO fx_rate_sets VALUES (?,?,?,?,?,?,?,?,?,?)",rate,t,"Taxas agosto 2026","2026-08","AOA","Rascunho",actor,now,null,null),
  q("INSERT OR IGNORE INTO fx_rates VALUES (?,?,?,?,?,?,?,?)",key(t,"usd-rate"),t,rate,"USD","AOA",92500000000,100000000,now),
  q("UPDATE fx_rate_sets SET status='Aprovado',approved_by=?,approved_at=? WHERE id=? AND status='Rascunho'",manager,now,rate),
  q("INSERT OR IGNORE INTO consolidation_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",cons,t,rate,"2026-08","AOA",1,"Calculado",5,1,2,855000000,0,855000000,"demo-input",actor,now,null,null,null),
  q("INSERT OR IGNORE INTO consolidation_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"cons-line"),t,cons,org,"AOA","AOA","EBITDA","EBITDA consolidado",855000000,100000000,855000000,5,"demo-source"),
  q("UPDATE consolidation_runs SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND status='Calculado'",manager,now,"demo-approval",cons),
  q("INSERT OR IGNORE INTO financial_models VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",model,t,org,"Plano de Negócio 2026–2030","AOA","2026-09",48,1050000000,"Rascunho",1,null,actor,now,null,null,null,null,null),
  q("INSERT OR IGNORE INTO financial_model_lines VALUES (?,?,?,?,?,?,?,?,?,?,?)",modelLine,t,model,"REV","Receitas projetadas","Receita",2180000000,800,1,actor,now)
 );
 for(let i=1;i<=12;i++)statements.push(q("INSERT OR IGNORE INTO financial_projections VALUES (?,?,?,?,?,?,?,?,?,?)",key(t,`projection-${i}`),t,model,modelLine,`2026-${String(((i+7)%12)+1).padStart(2,"0")}`,`2026-${String(((i+8)%12)+1).padStart(2,"0")}`,i,Math.round(2180000000*Math.pow(1.008,i)),Math.round(2180000000*Math.pow(1.008,i)),`formula-${i}`));
 statements.push(q("UPDATE financial_models SET status='Calculado',input_hash=?,calculated_by=?,calculated_at=? WHERE id=? AND status='Rascunho'","model-input",actor,now,model),q("UPDATE financial_models SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND status='Calculado'",manager,now,"model-approved",model));
 const catalog=key(t,"catalog"),batch=key(t,"batch"),diag=key(t,"diag-framework"),diagRun=key(t,"diag-run"),invest=key(t,"investment");
 statements.push(
  q("INSERT OR IGNORE INTO financial_line_catalog VALUES (?,?,?,?,?,?,?,?,?,?)",catalog,t,"REV","Receita","Receita","Operacional","Natural","Ativa",actor,now),
  q("INSERT OR IGNORE INTO financial_source_mappings VALUES (?,?,?,?,?,?,?,?)",key(t,"mapping"),t,"ERP-DEMO","701",catalog,member,actor,now),
  q("INSERT OR IGNORE INTO financial_import_batches VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",batch,t,org,"2026-08","AOA","ERP-DEMO","balancete_agosto.csv","Carregado",1,2180000000,"batch-input",actor,now,null,null,null,null),
  q("INSERT OR IGNORE INTO financial_import_rows VALUES (?,?,?,?,?,?,?,?,?,?,?)",key(t,"import-row"),t,batch,1,"701","Vendas e serviços",2180000000,catalog,member,"Mapeado","row-hash"),
  q("UPDATE financial_import_batches SET status='Validado',validated_by=?,validated_at=? WHERE id=? AND status='Carregado'",actor,now,batch),
  q("INSERT OR IGNORE INTO diagnostic_frameworks VALUES (?,?,?,?,?,?,?,?,?)",diag,t,"Diagnóstico Financeiro Executivo","Liquidez, rentabilidade, eficiência e sustentabilidade","Rascunho",actor,now,null,null),
  q("INSERT OR IGNORE INTO diagnostic_metric_configs VALUES (?,?,?,?,?,?)",key(t,"metric"),t,diag,"NET_MARGIN",10000,now),
  q("INSERT OR IGNORE INTO diagnostic_rules VALUES (?,?,?,?,?,?,?,?,?,?)",key(t,"rule"),t,diag,"NET_MARGIN",2000,null,8500,"Saudável","Preservar margem e acompanhar OPEX",now),
  q("UPDATE diagnostic_frameworks SET status='Ativo',activated_by=?,activated_at=? WHERE id=? AND status='Rascunho'",manager,now,diag),
  q("INSERT OR IGNORE INTO diagnostic_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",diagRun,t,org,diag,"2026-08","AOA",1,"Calculado",8500,"diag-input",actor,now,null,null,null),
  q("INSERT OR IGNORE INTO diagnostic_results VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"diag-result"),t,diagRun,"NET_MARGIN","Margem líquida",3250,100,8500,"Saudável","Preservar disciplina de custos","Resultado líquido / Receita","diag-result-hash"),
  q("UPDATE diagnostic_runs SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND status='Calculado'",manager,now,"diag-approved",diagRun),
  q("INSERT OR IGNORE INTO investment_cases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",invest,t,org,"Expansão Comercial 2027","AOA",1800,"Rascunho",1,null,null,null,null,actor,now,null,null,null,null,null)
 );
 for(const [i,amount] of [-1200000000,360000000,430000000,520000000,610000000].entries())statements.push(q("INSERT OR IGNORE INTO investment_cash_flows VALUES (?,?,?,?,?,?,?)",key(t,`cashflow-${i}`),t,invest,i,amount,i===0?"Investimento inicial":"Fluxo operacional",now));
 statements.push(q("UPDATE investment_cases SET status='Calculado',npv_minor=?,irr_bps=?,payback_period=?,input_hash=?,calculated_by=?,calculated_at=? WHERE id=? AND status='Rascunho'",685000000,2875,30,"invest-input",actor,now,invest),q("UPDATE investment_cases SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND status='Calculado'",manager,now,"invest-approved",invest));
 const wf=key(t,"workforce-plan"),req=key(t,"req"),candidate=key(t,"candidate"),application=key(t,"application"),onboarding=key(t,"onboarding"),shift=key(t,"shift");
 statements.push(
  q("INSERT OR IGNORE INTO workforce_plans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",wf,t,org,"Workforce Plan 2026–2027","AOA","2026-09","2027-08",1,"Rascunho",actor,now,null,null,null,null,null),
  q("INSERT OR IGNORE INTO workforce_plan_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"wf-line1"),t,wf,"Analista de Dados","FIN","2026-10",2,45000000,"Nova contratação","Suportar analytics e reporting",actor,now),
  q("INSERT OR IGNORE INTO workforce_plan_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"wf-line2"),t,wf,"HR Generalist","HCM","2027-01",1,38000000,"Nova contratação","Crescimento previsto",actor,now),
  q("UPDATE workforce_plans SET status='Submetido',submitted_by=?,submitted_at=? WHERE id=? AND status='Rascunho'",actor,now,wf),
  q("UPDATE workforce_plans SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND status='Submetido'",manager,now,"wf-approved",wf),
  q("INSERT OR IGNORE INTO recruitment_requisitions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",req,t,org,"Analista de Dados","FIN",2,"2026-10-01","Tempo integral",45000000,"AOA","Aberta","Executar o plano de analytics",actor,now,manager,now),
  q("INSERT OR IGNORE INTO recruitment_candidates VALUES (?,?,?,?,?,?,?,?,?)",candidate,t,"Sofia António","sofia.demo@example.com","+244 923 000 101","LinkedIn",now,actor,now),
  q("INSERT OR IGNORE INTO recruitment_applications VALUES (?,?,?,?,?,?,?,?,?,?)",application,t,req,candidate,"Contratada",5,"Perfil técnico e cultural aprovado",actor,now,now),
  q("INSERT OR IGNORE INTO employee_onboarding_cases VALUES (?,?,?,?,?,?,?,?,?,?)",onboarding,t,application,e3,"Em curso","2026-09-15",manager,actor,now,null),
  q("INSERT OR IGNORE INTO employee_onboarding_tasks VALUES (?,?,?,?,?,?,?,?,?,?)",key(t,"onboarding-task"),t,onboarding,"Preparar equipamento e acessos",manager,"2026-09-14","Concluída","Checklist TI validada",now,now),
  q("INSERT OR IGNORE INTO attendance_shifts VALUES (?,?,?,?,?,?,?,?,?,?,?)",shift,t,"PADRAO","Horário padrão",480,1020,60,480,"Ativo",actor,now),
  q("INSERT OR IGNORE INTO attendance_assignments VALUES (?,?,?,?,?,?,?,?,?)",key(t,"shift-assignment"),t,e1,shift,"2026-01-01",null,"Ativa",actor,now)
 );
 for(let day=3;day<=7;day++)statements.push(q("INSERT OR IGNORE INTO attendance_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,`attendance-${day}`),t,e1,`2026-08-${String(day).padStart(2,"0")}`,`2026-08-${String(day).padStart(2,"0")}T08:00:00Z`,`2026-08-${String(day).padStart(2,"0")}T17:00:00Z`,"Relógio Demo",480,480,0,null,"Presença regular",actor,now));
 statements.push(
  q("INSERT OR IGNORE INTO attendance_timesheets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"timesheet"),t,e1,"2026-08","Aprovado",2400,2400,0,5,"timesheet-hash",analyst,now,manager,now,"Conferido",now),
  q("INSERT OR IGNORE INTO payroll_loans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"loan"),t,e2,"Adiantamento","ADV-2026-001","AOA",12000000,3,"2026-09","Apoio de emergência","Aprovado",12000000,analyst,now,manager,now,"Aprovado conforme política",null),
  q("INSERT OR IGNORE INTO payroll_loan_installments VALUES (?,?,?,?,?,?,?,?)",key(t,"installment1"),t,key(t,"loan"),1,"2026-09",4000000,"Programada",null),
  q("INSERT OR IGNORE INTO payroll_adjustments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"adjustment"),t,e1,"RETRO-2026-001","Retroativo","Earning","2026-07","2026-09","AOA",3500000,"Atualização salarial retroativa","Aditivo contratual demonstrativo","Aprovado",analyst,now,manager,now,"Documento validado",null)
 );
 const source=key(t,"integration"),doctype=key(t,"doctype");statements.push(
  q("INSERT OR IGNORE INTO integration_sources VALUES (?,?,?,?,?,?,?,?,?)",source,t,"ERP-DEMO","ERP Financeiro Demonstrativo","API","Bidirecional","Ativa",actor,now),
  q("INSERT OR IGNORE INTO integration_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"integration-run"),t,source,org,1,"demo-enterprise-2026","Aprovada",1250,1247,3,"integration-hash",actor,now,actor,now,manager,now,"Três registos rejeitados por código inexistente"),
  q("INSERT OR IGNORE INTO employee_document_types VALUES (?,?,?,?,?,?,?,?,?,?)",doctype,t,"ID","Documento de identificação","Pessoal",1,"Confidencial","Ativo",actor,now),
  q("INSERT OR IGNORE INTO employee_documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"document"),t,e1,doctype,"AO-DEMO-001","2024-01-10","2029-01-10","documento_demo.pdf","application/pdf",245000,`demo/${t}/employee/id.pdf`,"document-hash",1,"Aprovado",analyst,now,manager,now,"Documento conferido",null),
  q("INSERT OR IGNORE INTO workflow_tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",key(t,"workflow"),t,org,"Finance",key(t,"action"),"Diagnóstico Financeiro","Acompanhar plano de redução de OPEX","Validar poupanças e evidências até ao fecho","Alta",manager,"2026-09-30T17:00:00Z","Em curso",actor,now,now,null,null)
 );
 for(let i=0;i<statements.length;i+=80)await db.batch(statements.slice(i,i+80));
 await db.prepare("INSERT INTO demo_enterprise_installations VALUES (?,?,?,?,?,?)").bind(t,"DEMO-ENTERPRISE-2026.2",actor,now,statements.length,9).run();
 return{tenant_id:t,dataset_version:"DEMO-ENTERPRISE-2026.2",installed_by:actor,installed_at:now,record_count:statements.length,module_count:9};
}
