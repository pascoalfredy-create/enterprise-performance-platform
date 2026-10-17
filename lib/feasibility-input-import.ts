import {feasibilityDefaults,feasibility,type FeasibilityInput} from './feasibility-engine';
import {planningDefaults,buildPlanningModel,type StudyAssumptions,type PlanningInput} from './feasibility-planning';
export function parseStudyAssumptions(table:string[][],currency:string):StudyAssumptions{
 const number=(s:string|undefined)=>{if(s===undefined||s.trim()===''||!Number.isFinite(Number(s)))throw new Error('Premissa inválida: valor importado.');return Number(s)};
 if(table[0]?.[2]!==currency)throw new Error('Premissa inválida: a moeda do ficheiro deve coincidir com a moeda selecionada.');
 const hidden=table.some(row=>row[6]==='MODEL_VERSION'),keyOf=(row:string[])=>hidden?row[6]:row[0];
 const version=number(table.find(r=>keyOf(r)==='MODEL_VERSION')?.[2]);if(![2,3].includes(version))throw new Error('Premissa inválida: use o modelo Excel exportado pelo estudo.');
 const values=new Map<string,string>();for(const row of table){const key=keyOf(row);if(key in feasibilityDefaults||key in planningDefaults||key==='periodFactor'){if(values.has(key))throw new Error('Premissa inválida: input repetido.');values.set(key,row[2]);}}
 const input={...feasibilityDefaults} as StudyAssumptions;for(const key of Object.keys(feasibilityDefaults) as (keyof FeasibilityInput)[])input[key]=number(values.get(key));const factor=number(values.get('periodFactor'));if(![1,12].includes(factor))throw new Error('Premissa inválida: período dos valores.');input.activityPeriod=factor===12?'month':'year';
 if(version===3){const p={...planningDefaults,capexEvents:[]} as PlanningInput;for(const key of Object.keys(planningDefaults).filter(k=>!['version','capexEvents'].includes(k))){const value=number(values.get(key));if(key==='repayment'){if(!Number.isInteger(value)||value<0||value>2)throw new Error('Premissa inválida: reembolso.');p.repayment=(['annuity','principal','bullet'] as const)[value]}else if(typeof planningDefaults[key as keyof PlanningInput]==='boolean'){if(![0,1].includes(value))throw new Error('Premissa inválida: opção.');(p as unknown as Record<string,unknown>)[key]=!!value}else (p as unknown as Record<string,unknown>)[key]=value;}
 p.capexEvents=table.filter(row=>keyOf(row)==='CAPEX_EVENT').map(row=>({month:number(row[2]),amount:number(row[3])})).filter(e=>e.amount!==0);input.planning=p;buildPlanningModel(input);}
 feasibility(input);return input;
}
