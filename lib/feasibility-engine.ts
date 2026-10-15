// Annual nominal project cash flow, end-of-year convention, no financing or terminal perpetuity.
export type FeasibilityInput={years:number;capex:number;residual:number;units:number;price:number;unitCost:number;fixedCosts:number;volumeGrowth:number;priceGrowth:number;costGrowth:number;taxRate:number;discountRate:number;receivableDays:number;inventoryDays:number;payableDays:number};
export const feasibilityDefaults:FeasibilityInput={years:5,capex:0,residual:0,units:0,price:0,unitCost:0,fixedCosts:0,volumeGrowth:0,priceGrowth:0,costGrowth:0,taxRate:0,discountRate:12,receivableDays:0,inventoryDays:0,payableDays:0};
export function feasibility(input:FeasibilityInput){
 for(const key of Object.keys(feasibilityDefaults))if(typeof input[key as keyof FeasibilityInput]!=='number')throw new Error('Premissa em falta: '+key);
 for(const [key,value] of Object.entries(input))if(!Number.isFinite(value))throw new Error('Premissa inválida: '+key);
 if(!Number.isInteger(input.years)||input.years<1||input.years>30||input.capex<=0||input.residual<0||input.residual>input.capex||['units','price','unitCost','fixedCosts'].some(key=>input[key as keyof FeasibilityInput]<0)||input.taxRate<0||input.taxRate>100||input.discountRate<0||input.discountRate>100||[input.volumeGrowth,input.priceGrowth,input.costGrowth].some(x=>x<=-100||x>100)||[input.receivableDays,input.inventoryDays,input.payableDays].some(x=>x<0||x>365))throw new Error('Reveja as premissas: horizonte 1–30 anos, investimento positivo, taxas e prazos dentro dos limites.');
 const round=(v:number)=>{const minor=Math.round(v*100);if(!Number.isSafeInteger(minor))throw new Error('Valor da projeção excede o limite suportado.');return minor/100},r=input.discountRate/100;
 const operating=(year:number,factor:number)=>{const units=input.units*Math.pow(1+input.volumeGrowth/100,year-1)*factor,price=input.price*Math.pow(1+input.priceGrowth/100,year-1),variable=round(units*input.unitCost*Math.pow(1+input.costGrowth/100,year-1)),revenue=round(units*price),fixed=round(input.fixedCosts*Math.pow(1+input.costGrowth/100,year-1)),workingCapital=round(revenue*input.receivableDays/365+variable*(input.inventoryDays-input.payableDays)/365);return {units,revenue,variable,fixed,workingCapital}};
 function project(factor:number){
  const initialWorkingCapital=operating(1,factor).workingCapital,initial=round(-input.capex-initialWorkingCapital),depreciation=round((input.capex-input.residual)/input.years),rows=[];let priorWorkingCapital=initialWorkingCapital,cumulative=initial,discountedCumulative=initial,payback:number|null=null,discountedPayback:number|null=null;
  for(let year=1;year<=input.years;year++){
   const o=operating(year,factor),ebitda=round(o.revenue-o.variable-o.fixed),ebit=round(ebitda-depreciation),tax=round(Math.max(0,ebit)*input.taxRate/100),net=round(ebit-tax),wcChange=round(o.workingCapital-priorWorkingCapital),terminal=year===input.years?round(input.residual+o.workingCapital):0,flow=round(net+depreciation-wcChange+terminal),discounted=round(flow/Math.pow(1+r,year)),before=cumulative,beforeDiscounted=discountedCumulative;
   cumulative=round(cumulative+flow);discountedCumulative=round(discountedCumulative+discounted);
   if(payback===null&&before<0&&cumulative>=0&&flow>0)payback=year-1+(-before/flow);
   if(discountedPayback===null&&beforeDiscounted<0&&discountedCumulative>=0&&discounted>0)discountedPayback=year-1+(-beforeDiscounted/discounted);
   rows.push({year,...o,ebitda,depreciation,ebit,tax,net,wcChange,terminal,flow,discounted,cumulative});priorWorkingCapital=o.workingCapital;
  }
  const flows=[initial,...rows.map(row=>row.flow)],value=(rate:number)=>flows.reduce((sum,f,i)=>sum+f/Math.pow(1+rate,i),0),conventional=initial<0&&flows.slice(1).every(x=>x>=0)&&flows.some(x=>x>0);let irr:number|null=null;
  if(conventional){let lo=-0.9999,hi=1;while(value(hi)>0&&hi<1e6)hi*=2;if(value(lo)>0&&value(hi)<=0){for(let i=0;i<160;i++){const mid=(lo+hi)/2;if(value(mid)>0)lo=mid;else hi=mid}irr=(lo+hi)/2*100}}
  const contribution=input.price-input.unitCost,breakEvenUnits=contribution>0?input.fixedCosts/contribution:null;
  return {initialWorkingCapital,initial,rows,npv:round(value(r)),irr,payback,discountedPayback,breakEvenUnits,conventional};
 }
 const base=project(1);return {...base,scenarios:[{name:'Adverso · volume −20%',...project(0.8)},{name:'Base',...base},{name:'Favorável · volume +20%',...project(1.2)}]};
}
