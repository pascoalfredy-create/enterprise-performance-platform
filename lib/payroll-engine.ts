/** Monetary inputs/outputs are integer minor units. Tax tables are isolated from the generic engine. */
export type PayrollTreatment = 'Unreviewed'|'Standard'|'Meal'|'Transport'|'Holiday'|'OtherDeduction'|'OtherEmployer'|'ManualTax';
export type PayrollComponentInput = {code:string;name?:string;category:string;method:string;valueMinor?:number;rateBps?:number;treatment?:string;amountMinor?:number};
export type PayrollInput = {baseMinor:number;currency:string;period:string;regime:'Generic'|'AO-2026';components:PayrollComponentInput[]};
export type PayrollItem = {code:string;name:string;category:string;method:string;amountMinor:number;treatment:string;irtExemptMinor:number;socialBaseMinor:number};
export const payrollTreatments:Record<PayrollTreatment,string>={Unreviewed:'Por rever',Standard:'Remuneração sujeita a IRT e INSS',Meal:'Alimentação — limite mensal de IRT',Transport:'Transporte — limite mensal de IRT',Holiday:'Subsídio de férias — sem INSS',OtherDeduction:'Outro desconto — não reduz base fiscal',OtherEmployer:'Outro encargo patronal',ManualTax:'Imposto ou contribuição manual'};
export const angolaPayroll2026={version:'AO-GROUP-A-2026.1',from:'2026-01',to:'2026-12',employeeRateBps:300,employerRateBps:800,allowanceExemptionMinor:3000000,
 sources:[{title:'Lei 14/25, artigo 21.º e Anexo I — IRT 2026',url:'https://www.angolex.com/paginas/leis/lei-que-aprova-o-orcamento-geral-do-estado-para-o-exercicio-economico-de-2026a-14a-25a.html'},{title:'Lei 18/14, artigo 7.º — matéria coletável',url:'https://lex.ao/docs/assembleia-nacional/2014/lei-n-o-18-14-de-22-de-outubro/'},{title:'Lei 28/20, artigo 2.º — alimentação e transporte',url:'https://lex.ao/docs/assembleia-nacional/2020/lei-n-o-28-20-de-22-de-julho/'},{title:'DP 227/18, artigos 12.º e 13.º — INSS',url:'https://lex.ao/docs/presidente-da-republica/2018/decreto-presidencial-n-o-227-18-de-27-de-setembro/'}],
 // Inclusive upper thresholds, fixed amount, marginal basis points, excess threshold (AOA).
 brackets:[[150000,0,0,0],[200000,12500,1600,150000],[300000,31250,1800,200000],[500000,49250,1900,300000],[1000000,87250,2000,500000],[1500000,187250,2100,1000000],[2000000,292250,2200,1500000],[2500000,402250,2300,2000000],[5000000,517250,2400,2500000],[10000000,1117250,2450,5000000],[Infinity,2342250,2500,10000000]]};
function money(n:number){if(!Number.isSafeInteger(n)||n<0)throw new Error('Montante salarial inválido ou fora do limite seguro.');return n;}
function sum(...values:number[]){return money(values.reduce((a,b)=>a+b,0));}
export function payrollPercentage(base:number,rate:number){money(base);if(!Number.isSafeInteger(rate)||rate<0||rate>100000)throw new Error('Percentagem salarial inválida.');const result=(BigInt(base)*BigInt(rate)+5000n)/10000n;return money(Number(result));}
export function angolaIrt2026(taxableMinor:number){money(taxableMinor);const i=angolaPayroll2026.brackets.findIndex(b=>taxableMinor<=b[0]*100),b=angolaPayroll2026.brackets[i];return {bracket:i+1,fixedMinor:b[1]*100,rateBps:b[2],excessThresholdMinor:b[3]*100,amountMinor:sum(b[1]*100,payrollPercentage(Math.max(0,taxableMinor-b[3]*100),b[2]))};}
export function validatePayrollTreatment(category:string,treatment:string){return category==='Earning'?['Standard','Meal','Transport','Holiday'].includes(treatment):category==='Deduction'?['OtherDeduction','ManualTax'].includes(treatment):category==='EmployerCost'?['OtherEmployer','ManualTax'].includes(treatment):false;}
export function calculatePayroll(input:PayrollInput){
 money(input.baseMinor);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)||!['Generic','AO-2026'].includes(input.regime))throw new Error('Período ou regime salarial inválido.');
 const automatic=input.regime==='AO-2026';if(automatic&&(input.currency!=='AOA'||input.period<angolaPayroll2026.from||input.period>angolaPayroll2026.to))throw new Error('O regime Angola 2026 exige AOA e um período de 2026.');
 const groups={Meal:0,Transport:0},used=new Set<string>();let gross=input.baseMinor,otherDeductions=0,otherEmployer=0,socialBase=input.baseMinor,exempt=0;
 const items:PayrollItem[]=[];
 for(const c of input.components){
  if(c.code?.startsWith('AUTO:'))throw new Error('Código reservado para rubricas automáticas.');
  if(!c.code||used.has(c.code))throw new Error('Rubrica duplicada no cálculo salarial.');used.add(c.code);
  if(!['Earning','Deduction','EmployerCost'].includes(c.category)||!['Fixed','Percentage','Installment','Retroactive'].includes(c.method))throw new Error('Categoria ou método salarial inválido.');
  const treatment=c.treatment||'Unreviewed';
  if(automatic&&(!validatePayrollTreatment(c.category,treatment)||treatment==='ManualTax'))throw new Error(`Reveja a incidência da rubrica ${c.code}. O regime automático não aceita impostos/contribuições manuais.`);
  // Retroactive earnings need source-period tax reconciliation rather than current-period taxation.
  if(automatic&&c.method==='Retroactive')throw new Error('Retroativos exigem reconciliação fiscal do período de origem; utilize o processamento parametrizado.');
  const amount=c.amountMinor===undefined?(c.method==='Fixed'?money(c.valueMinor!):c.method==='Percentage'?payrollPercentage(input.baseMinor,c.rateBps!):NaN):money(c.amountMinor);money(amount);
  let itemExempt=0,itemSocial=0;
  if(c.category==='Earning'){
   gross=sum(gross,amount);itemSocial=treatment==='Holiday'?0:amount;socialBase=sum(socialBase,itemSocial);
   if(treatment==='Meal'||treatment==='Transport'){itemExempt=Math.min(amount,Math.max(0,angolaPayroll2026.allowanceExemptionMinor-groups[treatment]));groups[treatment]=sum(groups[treatment],amount);exempt=sum(exempt,itemExempt);}
  }else if(c.category==='Deduction')otherDeductions=sum(otherDeductions,amount);else otherEmployer=sum(otherEmployer,amount);
  items.push({code:c.code,name:c.name||c.code,category:c.category,method:c.method,amountMinor:amount,treatment,irtExemptMinor:automatic?itemExempt:0,socialBaseMinor:automatic?itemSocial:0});
 }
 const employeeSocial=automatic?payrollPercentage(socialBase,angolaPayroll2026.employeeRateBps):0,employerSocial=automatic?payrollPercentage(socialBase,angolaPayroll2026.employerRateBps):0;
 const taxable=automatic?Math.max(0,gross-exempt-employeeSocial):null,irt=taxable===null?null:angolaIrt2026(taxable);
 if(automatic)items.push({code:'AUTO:INSS:EMPLOYEE',name:'INSS trabalhador',category:'Deduction',method:'Statutory',amountMinor:employeeSocial,treatment:'Automatic',irtExemptMinor:0,socialBaseMinor:0},{code:'AUTO:IRT',name:'IRT Grupo A',category:'Deduction',method:'Statutory',amountMinor:irt!.amountMinor,treatment:'Automatic',irtExemptMinor:0,socialBaseMinor:0},{code:'AUTO:INSS:EMPLOYER',name:'INSS entidade empregadora',category:'EmployerCost',method:'Statutory',amountMinor:employerSocial,treatment:'Automatic',irtExemptMinor:0,socialBaseMinor:0});
 const deductions=sum(otherDeductions,employeeSocial,irt?.amountMinor||0),employer=sum(otherEmployer,employerSocial);if(deductions>gross)throw new Error('As deduções excedem o bruto do colaborador.');
 return {regime:input.regime,ruleVersion:automatic?angolaPayroll2026.version:'GENERIC-2',baseMinor:input.baseMinor,grossMinor:gross,deductionMinor:deductions,employerMinor:employer,netMinor:gross-deductions,totalCostMinor:sum(gross,employer),components:items,tax:automatic?{employeeRateBps:angolaPayroll2026.employeeRateBps,employerRateBps:angolaPayroll2026.employerRateBps,socialBaseMinor:socialBase,employeeSocialMinor:employeeSocial,employerSocialMinor:employerSocial,irtExemptMinor:exempt,taxableMinor:taxable!,irtMinor:irt!.amountMinor,bracket:irt!.bracket,fixedMinor:irt!.fixedMinor,rateBps:irt!.rateBps,excessThresholdMinor:irt!.excessThresholdMinor,otherDeductionsMinor:otherDeductions}:null};
}
export type PayrollCalculationResult=ReturnType<typeof calculatePayroll>;
// Net pay is monotonically non-decreasing in the base as it grows (each extra unit of gross
// loses at most the top INSS + IRT marginal rate, well under 100%), so a bisection search over
// baseMinor converges on the smallest gross whose calculated net reaches the target exactly.
export function solveGrossForNet(targetNetMinor:number,fixedEarnings:PayrollComponentInput[],otherDeductionsMinor:number,period:string){
 money(targetNetMinor);
 const components=otherDeductionsMinor>0?[...fixedEarnings,{code:'SIM:OTHER_DEDUCTION',name:'Outros descontos',category:'Deduction',method:'Fixed',valueMinor:otherDeductionsMinor,treatment:'OtherDeduction'}]:fixedEarnings;
 const netAt=(baseMinor:number)=>calculatePayroll({baseMinor,currency:'AOA',period,regime:'AO-2026',components}).netMinor;
 let lo=0,hi=Math.max(targetNetMinor,100)*2,guard=0;
 while(netAt(hi)<targetNetMinor){hi*=2;if(++guard>60)throw new Error('Líquido pretendido fora do intervalo suportado.');}
 while(lo<hi){const mid=Math.floor((lo+hi)/2);if(netAt(mid)<targetNetMinor)lo=mid+1;else hi=mid;}
 return calculatePayroll({baseMinor:hi,currency:'AOA',period,regime:'AO-2026',components});
}
