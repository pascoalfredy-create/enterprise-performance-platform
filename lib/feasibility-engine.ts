// Nominal annual project cash flows; cash flows discounted at year end, investment at t=0.
export type FeasibilityInput={years:number;capex:number;residual:number;units:number;price:number;unitCost:number;fixedCosts:number;volumeGrowth:number;priceGrowth:number;costGrowth:number;taxRate:number;discountRate:number;receivableDays:number;inventoryDays:number;payableDays:number};
export type FeasibilityAssumptions=FeasibilityInput&{activityPeriod?:'year'|'month'};
export const feasibilityDefaults:FeasibilityInput={years:5,capex:0,residual:0,units:0,price:0,unitCost:0,fixedCosts:0,volumeGrowth:0,priceGrowth:0,costGrowth:0,taxRate:0,discountRate:12,receivableDays:0,inventoryDays:0,payableDays:0};
export function netPresentValue(flows:number[],rate:number){
 if(!flows.length||!Number.isFinite(rate)||rate<=-1||flows.some(v=>!Number.isFinite(v)))throw new Error('Premissa inválida: fluxos ou taxa de desconto.');
 return flows.reduce((sum,flow,year)=>sum+flow/Math.pow(1+rate,year),0);
}
/** Conventional series have one negative initial flow and non-negative future flows. Returns annual percent. */
export function internalRateOfReturn(flows:number[]){
 if(flows.length<2||flows[0]>=0||!flows.slice(1).some(v=>v>0)||flows.slice(1).some(v=>v<0)||flows.some(v=>!Number.isFinite(v)))return null;
 let lo=-0.9999,hi=1;while(netPresentValue(flows,hi)>0&&hi<1e12)hi*=2;
 if(netPresentValue(flows,lo)<=0||netPresentValue(flows,hi)>0)return null;
 for(let i=0;i<180;i++){const mid=(lo+hi)/2;if(netPresentValue(flows,mid)>0)lo=mid;else hi=mid}
 const result=(lo+hi)/2*100;return Number.isFinite(result)?Math.abs(result)<1e-10?0:result:null;
}
export function feasibility(input:FeasibilityAssumptions){
 for(const key of Object.keys(feasibilityDefaults) as (keyof FeasibilityInput)[])if(typeof input[key]!=='number'||!Number.isFinite(input[key]))throw new Error('Premissa inválida ou em falta: '+key);
 if(input.activityPeriod!==undefined&&!['year','month'].includes(input.activityPeriod))throw new Error('Premissa inválida: período dos dados.');
 if(!Number.isInteger(input.years)||input.years<1||input.years>30||input.capex<0.01||input.residual<0||input.residual>input.capex||['units','price','unitCost','fixedCosts'].some(key=>input[key as keyof FeasibilityInput]<0)||input.taxRate<0||input.taxRate>100||input.discountRate<0||input.discountRate>100||[input.volumeGrowth,input.priceGrowth,input.costGrowth].some(x=>x<=-100||x>100)||[input.receivableDays,input.inventoryDays,input.payableDays].some(x=>x<0||x>365))throw new Error('Reveja as premissas: horizonte 1–30 anos, investimento mínimo de 0,01, taxas e prazos dentro dos limites.');
 for(const key of ['capex','residual','fixedCosts'] as const)if(Number(input[key].toFixed(2))!==input[key])throw new Error('Premissa inválida: '+key+' admite até duas casas decimais.');
 const round=(v:number)=>{const minor=Math.round(v*100);if(!Number.isSafeInteger(minor))throw new Error('Valor da projeção excede o limite suportado.');return minor/100},r=input.discountRate/100,periodFactor=input.activityPeriod==='month'?12:1;
 const operating=(year:number,factor:number)=>{const units=input.units*periodFactor*Math.pow(1+input.volumeGrowth/100,year-1)*factor,price=input.price*Math.pow(1+input.priceGrowth/100,year-1),variable=round(units*input.unitCost*Math.pow(1+input.costGrowth/100,year-1)),revenue=round(units*price),fixed=round(input.fixedCosts*periodFactor*Math.pow(1+input.costGrowth/100,year-1)),workingCapital=round(revenue*input.receivableDays/365+variable*(input.inventoryDays-input.payableDays)/365);return {units,price,revenue,variable,fixed,workingCapital}};
 function project(factor:number){
  const rawInitialWorkingCapital=operating(1,factor).workingCapital;
  // Trade credit is not cash available before trading starts. Negative operating WC is realised in year one.
  const initialWorkingCapital=Math.max(0,rawInitialWorkingCapital),initial=round(-input.capex-initialWorkingCapital),depreciable=input.capex-input.residual,rows=[];let priorWorkingCapital=initialWorkingCapital,cumulative=initial,discountedCumulative=initial,payback:number|null=null,discountedPayback:number|null=null;
  for(let year=1;year<=input.years;year++){
   const o=operating(year,factor),depreciation=round(round(depreciable*year/input.years)-round(depreciable*(year-1)/input.years)),ebitda=round(o.revenue-o.variable-o.fixed),ebit=round(ebitda-depreciation),tax=round(Math.max(0,ebit)*input.taxRate/100),net=round(ebit-tax),wcChange=round(o.workingCapital-priorWorkingCapital),terminal=year===input.years?round(input.residual+o.workingCapital):0,flow=round(net+depreciation-wcChange+terminal),discounted=round(flow/Math.pow(1+r,year)),before=cumulative,beforeDiscounted=discountedCumulative;
   cumulative=round(cumulative+flow);discountedCumulative=round(discountedCumulative+discounted);
   if(payback===null&&before<0&&cumulative>=0&&flow>0)payback=year-1+(-before/flow);
   if(discountedPayback===null&&beforeDiscounted<0&&discountedCumulative>=0&&discounted>0)discountedPayback=year-1+(-beforeDiscounted/discounted);
   rows.push({year,...o,ebitda,depreciation,ebit,tax,net,wcChange,terminal,flow,discounted,cumulative});priorWorkingCapital=o.workingCapital;
  }
  const flows=[initial,...rows.map(row=>row.flow)],conventional=initial<0&&flows.slice(1).every(x=>x>=0)&&flows.some(x=>x>0),irr=internalRateOfReturn(flows);
  const contribution=input.price-input.unitCost,cashBreakEvenUnits=contribution>0?input.fixedCosts*periodFactor/contribution:null,breakEvenUnits=contribution>0?(input.fixedCosts*periodFactor+rows[0].depreciation)/contribution:null;
  const flags:string[]=[];if(irr!==null&&irr>100)flags.push('highReturn');if(input.unitCost===0&&rows[0].revenue>0)flags.push('noVariable');if(input.fixedCosts===0&&rows[0].revenue>0)flags.push('noFixed');if(rawInitialWorkingCapital<0)flags.push('tradeCredit');if([input.volumeGrowth,input.priceGrowth].some(x=>x>30))flags.push('highGrowth');
  return {initialWorkingCapital,rawInitialWorkingCapital,initial,rows,flows,npv:round(netPresentValue(flows,r)),irr,payback,discountedPayback,breakEvenUnits,cashBreakEvenUnits,conventional,flags};
 }
 const base=project(1);return {...base,modelVersion:2,activityPeriod:input.activityPeriod||'year',scenarios:[{name:'Adverso · volume −20%',...project(0.8)},{name:'Base',...base},{name:'Favorável · volume +20%',...project(1.2)}]};
}
