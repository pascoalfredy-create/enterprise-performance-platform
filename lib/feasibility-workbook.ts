import {taxCalendarCopy} from './study-tax-copy';
import {debtDrawdownCopy} from './study-debt-copy';
import {equityCalendarCopy} from './study-equity-copy';
import {operatingProfileCopy} from './study-operating-copy';
import {depreciationCategories,depreciationReference} from './depreciation-reference';
import {studyActivityCopy} from './study-activity-copy';
import {buildPlanningModel,studySheets,planningDreRows,planningBalanceRows,planningCashRows,planningMetricRows,type StudyAssumptions,type PlanningResult} from './feasibility-planning';
import {StudyModel,address,column,formula,add,sub,mul,div,pow,max,min,round,when,eq,lt,le,expr,type Expr} from './study-model';
import {feasibility} from './feasibility-engine';
import {integratedCopy,studyLabel} from './feasibility-integrated-copy';
import {financialAnalysis,analysisSheets,analysisCopy,analysisFormula,cardExplanations,cardLabels} from './feasibility-analysis';
import {financingCopy} from './feasibility-presentation';
import {statementLayouts,statementCopy} from './feasibility-statements';
import {buildXlsxBlob,type SheetInput,type XlsxCell} from './xlsx';
export type StudyDocument={name:string;organization:string;currency:string;id?:string|null;dirty?:boolean};
function cellValue(cell:XlsxCell|undefined){return typeof cell==='object'&&cell!==null?cell.value:cell??''}
export function workbookPreview(sheets:SheetInput[],years:number){return sheets.map((sheet,i)=>{const periodic=i!==0&&i!==4&&i!==11,start=i===0||i===4||i===11?0:43;const entries=sheet.rows.slice(start).map((row,n)=>({values:row.slice(0,i===0?5:i===11?3:years+3).map(cellValue),styles:row.slice(0,i===0?5:i===11?3:years+3).map(c=>typeof c==='object'&&c!==null?c.style??0:0),annotation:sheet.rowNotes?.[n+start+1]})).filter(row=>row.values.some(v=>v!==''));const notes=periodic?entries.filter(r=>r.values.length===1).map(r=>String(r.values[0])):[],table=periodic?entries.filter(r=>r.values.length!==1):entries;return {name:sheet.name,rows:table.map(r=>r.values),styles:table.map(r=>r.styles),annotations:table.map(r=>r.annotation),notes}})}
export function studyWorkbook(input:StudyAssumptions,meta:StudyDocument,index=0,provided?:PlanningResult|null):SheetInput[]{
 if(!input.planning){const sheets=legacyWorkbook(input,meta,index);attachActivityInputs(sheets,input,index);return sheets;}
 const p=provided||buildPlanningModel(input),analysis=financialAnalysis(p),names=[...studySheets,...analysisSheets];const labels:Record<string,number>[]=[{},planningDreRows,planningBalanceRows,planningCashRows,planningMetricRows],sheets:SheetInput[]=names.map((name,i)=>({name,rows:[[i===0?meta.name:name,meta.organization,meta.currency,meta.id||'',meta.dirty?'Draft':'Saved'],[],[]],protect:true,hiddenColumns:i===0?[5,6]:undefined,hiddenRows:i===3?[36,37,38,40,41,42,43]:i===2?[28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43]:undefined,freeze:i!==4,widths:i===0?[30,65,20,20,75]:i===4?[58,24,72]:[50,22,...Array(361).fill(16)]}));
 const write=(i:number,row:number,col:number,v:XlsxCell)=>{while(sheets[i].rows.length<row)sheets[i].rows.push([]);sheets[i].rows[row-1][col]=v};
 for(const [key,e] of p.model.cells){const match=key.match(/^'([^']+)'!([A-Z]+)(\d+)$/)!;const i=names.indexOf(match[1]),col=[...match[2]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;write(i,Number(match[3]),col,typeof e==='number'?{value:e,style:i===0?2:1}:{formula:formula(e),value:p.model.get(key),style:1});}
 ['columnGroup','columnVariable','columnValue','columnUnit','columnNote'].forEach((key,c)=>write(0,2,c,{value:integratedCopy[key as keyof typeof integratedCopy][index],style:3}));write(0,3,0,integratedCopy.modelVersion[index]);write(0,3,6,'MODEL_VERSION');write(0,3,2,3);
 for(const entry of p.inputRows){write(0,entry.row,0,inputGroup(entry.key,index));write(0,entry.row,6,entry.key);write(0,entry.row,1,entry.key==='equity'?financingCopy.manualAmount[index]:studyLabel(entry.key,index));write(0,entry.row,3,inputUnit(entry.key,index,meta.currency));write(0,entry.row,4,entry.key==='depreciationAnnualRate'?integratedCopy.depreciationMethod[index]:entry.key==='equity'?financingCopy.excelEquityHelp[index]:entry.key==='repayment'?'0 = '+integratedCopy.annuity[index]+'; 1 = '+integratedCopy.principal[index]+'; 2 = '+integratedCopy.bullet[index]:typeof input.planning[entry.key as keyof typeof input.planning]==='boolean'?integratedCopy.booleanLegend[index]:'');}
 for(let i=0;i<24;i++){write(0,p.eventStart+i,0,integratedCopy.investments[index]);write(0,p.eventStart+i,6,'CAPEX_EVENT');write(0,p.eventStart+i,1,integratedCopy.month[index]);write(0,p.eventStart+i,4,integratedCopy.amount[index]);}
 for(let i=1;i<5;i++){
  for(const [key,row] of Object.entries(labels[i])){write(i,row,0,studyLabel(i===2&&key==='debt'?'closingDebt':i===2&&key==='equity'?'equityTotal':key,index));if(i!==4)write(i,row,1,key);}
  if(i<4){write(i,2,0,{value:integratedCopy.monthly[index],style:3});for(let m=0;m<=360;m++)write(i,2,m+2,{value:m,style:3});
   write(i,44,0,{value:integratedCopy.annual[index],style:3});for(let y=0;y<=30;y++)write(i,44,y+2,{value:y,style:3});let out=45;
   for(const [key,row] of Object.entries(labels[i])){if(key==='balanceAbsolute')continue;if(i===3&&['payback','discountedPayback','cashBeforeEquity','dscr','dscrForMinimum','cashDifference','debtDifference','projectSign','projectSignChanges','investorSign','investorSignChanges'].includes(key))continue;write(i,out,0,studyLabel(i===2&&key==='debt'?'closingDebt':i===2&&key==='equity'?'equityTotal':key,index));write(i,out,1,key);
    for(let y=0;y<=30;y++){const at=y*12,isPosition=i===2||i===1&&['bookBefore','depAccum'].includes(key)||i===3&&['openingDebt','closingDebt','closingCash','cashAfterDistribution','distributions','projectCumulative','discountedCumulative','profitCumulative'].includes(key),e=y===0?address(studySheets[i],row,2):isPosition?address(studySheets[i],row,at+2):add(...Array.from({length:12},(_,j)=>address(studySheets[i],row,(y-1)*12+j+3)));const expression=y>0&&i===1&&key==='price'||y>0&&i===3&&key==='openingDebt'?address(studySheets[i],row,(y-1)*12+3):e;const value=p.model.evaluate(expression);write(i,out,y+2,{formula:formula(expression),value,style:1});}out++;}
  }
 }
 // Reader-facing maps follow the IAPMEI statement structure. Calculation rows
 // remain linked and protected, but are hidden instead of shown as statements.
 for(const [n,layout] of statementLayouts(p).entries()){
  const i=n+1,sheet=sheets[i];sheet.rows=sheet.rows.slice(0,43);sheet.hiddenRows=Array.from({length:42},(_,r)=>r+2);sheet.freeze=false;sheet.hiddenColumns=[1,...Array.from({length:330},(_,c)=>c+33)];
  sheet.rows[0]=[{value:layout.title[index],style:3},'',meta.organization,meta.currency];
  sheet.rows[43]=[{value:statementCopy.item[index],style:3},'',...Array.from({length:31},(_,y)=>({value:y,style:3}))];
  for(const line of layout.lines){const style=line.kind==='total'?7:line.kind==='section'?8:line.kind==='subtotal'?6:9;sheet.rows.push([{value:line.label[index],style},'',...Array.from({length:31},(_,y)=>{if(!line.value)return {value:'',style};const e=when(le(y,address(studySheets[0],p.inputRows.find(r=>r.key==='years')!.row,2)),line.value(y));return {formula:formula(e),value:p.model.evaluate(e),style}})]);}
  sheet.rows.push([statementCopy.note[index]],[statementCopy.source[index]]);
 }
 for(const [n,layout] of analysis.layouts.entries()){
  const sheet=sheets[n+5];sheet.hiddenRows=Array.from({length:42},(_,r)=>r+2);sheet.hiddenColumns=[1,...Array.from({length:330},(_,c)=>c+33)];sheet.freeze=false;sheet.rows=sheet.rows.slice(0,43);while(sheet.rows.length<43)sheet.rows.push([]);sheet.rowNotes={};
  sheet.rows[0]=[{value:layout.title[index],style:3},'',meta.organization,meta.currency];sheet.rows[43]=[{value:statementCopy.item[index],style:3},'',...Array.from({length:31},(_,y)=>({value:y,style:3}))];
  for(const line of layout.lines){const style=line.kind==='total'?7:line.kind==='section'?8:line.kind==='subtotal'?6:9,unitStyle=line.unit==='percent'?10:line.unit==='multiple'?11:style;
   sheet.rows.push([{value:line.label[index]+(line.unit==='years'?' ('+integratedCopy.unitYear[index]+')':''),style},'',...Array.from({length:31},(_,y)=>{if(!line.value)return {value:'',style};const e=when(le(y,analysis.inputYears),line.value(y),expr('NA'));return {formula:formula(e),value:p.model.evaluate(e),style:unitStyle}})]);
   sheet.rowNotes[sheet.rows.length]={formula:analysisFormula(line.formulaLabel,index),note:line.note?.[index]||'',unit:line.unit};
  }
  sheet.rows.push([analysisCopy.basis[index]],[analysisCopy.scope[index]],[statementCopy.source[index]]);
 }
 const noteSheet=sheets[11];noteSheet.rows=[[{value:analysisCopy.notes[index],style:3},analysisCopy.formula[index],analysisCopy.explain[index]],...analysis.notes.map(line=>[line.label[index],analysisFormula(line.formulaLabel,index),line.note![index]]),...Object.entries(cardExplanations).map(([key,note])=>[cardLabels[key][index],'',note[index]]),[analysisCopy.basis[index]],[analysisCopy.scope[index]],[statementCopy.source[index]]];noteSheet.rows=noteSheet.rows.map((row,n)=>row.map(value=>typeof value==='object'?value:{value,style:n===0?3:12}));noteSheet.widths=[52,72,120];noteSheet.freeze=false;
 for(const [n,row] of analysis.summaryRows.entries())write(4,row,0,['VAL FCFF / WACC','VAL FCFF / Ke','VAL FCFE / Ke','TIR FCFE (%)','Payback FCFE','Payback FCFE / Ke','Payback FCFF / WACC','Payback FCFF / Ke'][n]);
 sheets[0].validations=p.inputRows.map(entry=>{const v=inputValidation(entry.key,'C'+entry.row);if(entry.key==='graceMonths')v.max='$C$'+p.inputRows.find(r=>r.key==='debtMonths')!.row+'-1';if(entry.key==='residual')v.max='$C$'+p.inputRows.find(r=>r.key==='capex')!.row;return v});for(let i=0;i<24;i++)sheets[0].validations.push({range:'C'+(p.eventStart+i),type:'whole',min:0,max:360},{range:'D'+(p.eventStart+i),type:'decimal',min:0,max:1000000000000});
 if((input.planning.depreciationAnnualRate??0)>0)noteSheet.rows.push([integratedCopy.depreciationAnnualRate[index],String(input.planning.depreciationAnnualRate)+'%',integratedCopy.depreciationMethod[index]]);
 const assetReferences=[input.planning.initialDepreciation,...input.planning.capexEvents.map(e=>e.depreciation)];for(const [slot,asset] of assetReferences.entries()){if(!asset?.depreciationCategoryId)continue;const item=depreciationCategories.find(c=>c.id===asset.depreciationCategoryId);if(!item)continue;const row=p.eventStart+25+slot;write(0,row,0,studyLabel('asset'+slot+'_depreciationAnnualRate',index));write(0,row,1,slot);write(0,row,2,item.id);write(0,row,4,depreciationReference.instrument+' · '+item.sector+' '+item.code+' · '+item.label);write(0,row,6,'ASSET_DEPRECIATION_REFERENCE');noteSheet.rows.push([depreciationReference.instrument+' · '+item.sector+' '+item.code+' · '+item.label+' · '+asset.depreciationAnnualRate+'%']);}
 if(input.planning.taxPaymentCalendar)noteSheet.rows.push([taxCalendarCopy.title[index],taxCalendarCopy.help[index]]);
 if(input.planning.debtDrawdowns!==undefined)noteSheet.rows.push([debtDrawdownCopy.title[index],debtDrawdownCopy.help[index]]);
 if(input.planning.equityEvents!==undefined)noteSheet.rows.push([equityCalendarCopy.title[index],equityCalendarCopy.help[index]]);
 if(input.planning.operatingProfile)noteSheet.rows.push([operatingProfileCopy.title[index],operatingProfileCopy.help[index]]);
 const category=depreciationCategories.find(c=>c.id===input.planning?.depreciationCategoryId);if(category){write(0,p.eventStart-1,1,depreciationReference.instrument+' · '+category.sector+' '+category.code);write(0,p.eventStart-1,2,category.id);write(0,p.eventStart-1,6,'DEPRECIATION_REFERENCE');const source=depreciationReference.instrument+' · '+category.sector+' '+category.code+' · '+category.label+' · '+(category.annualRateBps/100)+'%';noteSheet.rows.push([source]);}
 const notes=[integratedCopy.previewNote[index],integratedCopy.method[index],integratedCopy.exitNote[index],integratedCopy.coverageNote[index],integratedCopy.valuationNote[index]];for(const [i,note] of notes.entries())write(4,23+i,0,note);
 write(4,28,0,'Model 3 · '+meta.name+' · '+meta.currency);applyResultColors(sheets);attachActivityInputs(sheets,input,index);return sheets;
}
// The established annual model remains mathematically identical, including its
// initial working capital convention. Its workbook also has five live sheets.
function legacyWorkbook(input:StudyAssumptions,meta:StudyDocument,index:number):SheetInput[]{
 const base=feasibility(input),model=new StudyModel(),[S,D,B,C,M]=studySheets,P:Record<string,string>={},sheets:SheetInput[]=studySheets.map((name,i)=>({name,protect:true,hiddenColumns:i===0?[5,6]:undefined,hiddenRows:i===3?[36,37,38,40,41,42,43]:i===2?[28]:undefined,freeze:i!==4,widths:i===0?[30,60,22,20,70]:[50,22,...Array(31).fill(18)],rows:[[meta.name,meta.organization,meta.currency,'Model 2'],[],[]]}));
 const write=(s:number,r:number,c:number,v:XlsxCell)=>{while(sheets[s].rows.length<r)sheets[s].rows.push([]);sheets[s].rows[r-1][c]=v};let next=4;
 for(const [key,v] of Object.entries(input))if(typeof v==='number'){P[key]=model.set(S,next,2,v);write(0,next,0,inputGroup(key,index));write(0,next,6,key);write(0,next,1,studyLabel(key,index));write(0,next,3,inputUnit(key,index,meta.currency));next++;}P.periodFactor=model.set(S,next,2,input.activityPeriod==='month'?12:1);write(0,next,0,inputGroup('periodFactor',index));write(0,next,6,'periodFactor');write(0,next,1,studyLabel('periodFactor',index));
 ['columnGroup','columnVariable','columnValue','columnUnit','columnNote'].forEach((key,c)=>write(0,2,c,{value:integratedCopy[key as keyof typeof integratedCopy][index],style:3}));write(0,3,0,integratedCopy.modelVersion[index]);write(0,3,6,'MODEL_VERSION');write(0,3,2,2);
 const ref=(s:string,r:number,y:number)=>address(s,r,y+2),dr=(r:number,y:number)=>ref(D,r,y),br=(r:number,y:number)=>ref(B,r,y),cr=(r:number,y:number)=>ref(C,r,y),initialNwc=max(0,round(add(mul(P.units,P.periodFactor,P.price,div(P.receivableDays,365)),mul(P.units,P.periodFactor,P.unitCost,div(sub(P.inventoryDays,P.payableDays),365))))),funding=add(P.capex,initialNwc);
 const dnames:Record<number,string>={4:'units',5:'price',6:'revenue',7:'variable',8:'fixed',9:'ebitda',10:'depreciation',11:'ebit',14:'tax',16:'net'},bnames:Record<number,string>={4:'fixedAssets',7:'receivables',8:'inventory',9:'payables',13:'cash',17:'capital',18:'retained',19:'assets',20:'liabilities',21:'equity',22:'difference',23:'nwc'},cnames:Record<number,string>={4:'wcChange',5:'residual',6:'projectFlow',7:'discountedFlow',8:'projectCumulative',9:'discountedCumulative',10:'payback',11:'discountedPayback'};
 for(let y=0;y<=30;y++){
  const active=le(y,P.years),last=eq(y,P.years),at=(e:Expr)=>when(active,e),set=(s:string,r:number,e:Expr)=>model.set(s,r,y+2,e);
  for(const r of Object.keys(dnames).map(Number))set(D,r,0);
  if(y){set(D,4,at(mul(P.units,P.periodFactor,pow(add(1,div(P.volumeGrowth,100)),y-1))));set(D,5,at(mul(P.price,pow(add(1,div(P.priceGrowth,100)),y-1))));set(D,6,round(mul(dr(4,y),dr(5,y))));set(D,7,round(mul(dr(4,y),P.unitCost,pow(add(1,div(P.costGrowth,100)),y-1))));set(D,8,at(round(mul(P.fixedCosts,P.periodFactor,pow(add(1,div(P.costGrowth,100)),y-1)))));set(D,9,round(sub(dr(6,y),add(dr(7,y),dr(8,y)))));set(D,10,at(sub(round(div(mul(sub(P.capex,P.residual),y),P.years)),round(div(mul(sub(P.capex,P.residual),y-1),P.years)))));set(D,11,sub(dr(9,y),dr(10,y)));set(D,14,round(mul(max(0,dr(11,y)),div(P.taxRate,100))));set(D,16,sub(dr(11,y),dr(14,y)));}
  const wc=y===0?initialNwc:at(round(add(mul(dr(6,y),div(P.receivableDays,365)),mul(dr(7,y),div(sub(P.inventoryDays,P.payableDays),365)))));
  set(B,23,wc);set(B,7,y?when(last,0,mul(dr(6,y),div(P.receivableDays,365))):initialNwc);set(B,8,y?when(last,0,mul(dr(7,y),div(P.inventoryDays,365))):0);set(B,9,y?when(last,0,mul(dr(7,y),div(P.payableDays,365))):0);set(B,4,y?when(lt(y,P.years),sub(P.capex,add(...Array.from({length:y},(_,j)=>dr(10,j+1))))):P.capex);
  set(C,4,y?at(sub(br(23,y),br(23,y-1))):0);set(C,5,y?when(last,add(P.residual,wc)):0);set(C,6,y?at(round(add(dr(16,y),dr(10,y),mul(-1,cr(4,y)),cr(5,y)))):mul(-1,funding));set(C,7,y?div(cr(6,y),pow(add(1,div(P.discountRate,100)),y)):cr(6,0));set(C,8,y?add(cr(8,y-1),cr(6,y)):cr(6,0));set(C,9,y?add(cr(9,y-1),cr(7,y)):cr(6,0));
  for(const [r,cum,flow] of [[10,8,6],[11,9,7]])set(C,r,y?when(mul(active,lt(cr(cum,y-1),0),le(0,cr(cum,y)),lt(0,cr(flow,y))),sub(y-1,div(cr(cum,y-1),cr(flow,y))),1e9):1e9);
  set(B,13,add(funding,cr(8,y)));set(B,17,funding);set(B,18,add(...Array.from({length:y},(_,j)=>dr(16,j+1))));set(B,19,add(br(4,y),br(7,y),br(8,y),br(13,y)));set(B,20,br(9,y));set(B,21,add(br(17,y),br(18,y)));set(B,22,sub(br(19,y),add(br(20,y),br(21,y))));
 }
 model.set(M,4,1,round(add(cr(6,0),expr('NPV',div(P.discountRate,100),...Array.from({length:30},(_,i)=>cr(6,i+1))))));model.set(M,5,1,when(eq(add(...Array.from({length:30},(_,i)=>when(lt(cr(6,i+1),0),1))),0),mul(expr('IRR_ACTIVE',P.years,...Array.from({length:31},(_,i)=>cr(6,i))),100),expr('NA')));for(const [r,c] of [[6,10],[7,11]]){const value=min(...Array.from({length:30},(_,i)=>cr(c,i+1)));model.set(M,r,1,when(lt(value,1e9),value,expr('NA')))}
 for(const [key,e] of model.cells){const m=key.match(/^'([^']+)'!([A-Z]+)(\d+)$/)!,i=studySheets.indexOf(m[1] as typeof studySheets[number]),c=[...m[2]].reduce((n,v)=>n*26+v.charCodeAt(0)-64,0)-1;write(i,+m[3],c,typeof e==='number'?{value:e,style:i===0?2:1}:{formula:formula(e),value:model.get(key),style:1});}
 for(const [i,names] of [[1,dnames],[2,bnames],[3,cnames]] as const){for(const [row,key] of Object.entries(names))write(i,+row,0,studyLabel(key,index));write(i,44,0,{value:integratedCopy.annual[index],style:3});for(let r=2;r<=Math.max(...Object.keys(names).map(Number));r++)sheets[i].rows[43+r-1]=[...(sheets[i].rows[r-1]||[])];for(let y=0;y<=30;y++){write(i,2,y+2,{value:y,style:3});write(i,45,y+2,{value:y,style:3});}}
 for(const [r,key] of [[4,'npv'],[5,'irr'],[6,'payback'],[7,'discountedPayback']] as const)write(4,r,0,studyLabel(key,index));write(4,10,0,'Model 2: '+meta.name);write(4,11,0,integratedCopy.preserve[index]);write(4,12,0,'Annual nominal project flows · no financing / VAT / reinvestments');
 // Independent regression checks keep this export aligned with established cards.
 if(Math.abs(model.get(address(M,4,1))-base.npv)>.011)throw new Error('Valor da projeção: divergência na exportação.');applyResultColors(sheets);return sheets;
}
function inputUnit(key:string,index:number,currency:string){if(['taxCycleMonths','taxLagMonths'].includes(key))return integratedCopy.unitMonth[index];if(/^(?:equityEvent|debtDrawdown)\d+Amount$/.test(key))return currency;if(/^(?:equityEvent|debtDrawdown)\d+Month$/.test(key))return integratedCopy.unitMonth[index];return ['years','usefulLifeYears'].includes(key)?integratedCopy.unitYear[index]:key.endsWith('Months')?integratedCopy.unitMonth[index]:key.endsWith('Days')?integratedCopy.unitDay[index]:key.endsWith('Growth')||['taxRate','discountRate','debtRate','ke','depreciationAnnualRate','vatRate','vatRecovery','vatFixedShare'].includes(key)?'%':key==='dscrLimit'?'×':['capex','residual','fixedCosts','debt','debtFee','equity','minimumCash','price','unitCost'].includes(key)?currency:''}
function inputGroup(key:string,index:number){return integratedCopy[key==='years'||key==='periodFactor'?'groupCalendar':key.startsWith('vat')||key.startsWith('tax')||['taxRate','refundVat','interestShield'].includes(key)?'groupTax':['debt','debtRate','debtMonths','graceMonths','repayment','totalGrace','debtFee','equityAuto','equity','minimumCash','ke','useWacc','discountRate','dscrLimit'].includes(key)?'groupFinance':'groupOperations'][index]}
function inputValidation(key:string,range:string):NonNullable<SheetInput['validations']>[number]{if(key==='taxCalendarEnabled')return {range,type:'list',values:'0,1'};if(key==='taxCycleMonths')return {range,type:'list',values:'1,3,6,12'};if(key==='taxLagMonths')return {range,type:'whole',min:0,max:12};if(/^(?:equityEvent|debtDrawdown)\d+Month$/.test(key))return {range,type:'whole',min:1,max:360};if(/^asset\d+_/.test(key)){const field=key.split('_')[1];return field==='inServiceMonth'?{range,type:'whole',min:1,max:360}:field==='usefulLifeYears'?{range,type:'decimal',min:1/12,max:100}:{range,type:'decimal',min:0,max:100};}if(key==='operatingProfileEnabled')return {range,type:'list',values:'0,1'};if(key==='operatingStartMonth')return {range,type:'whole',min:1,max:360};if(key==='operatingRampMonths')return {range,type:'whole',min:0,max:360};if(key.startsWith('operatingWeight'))return {range,type:'decimal',min:0,max:10000};if(['equityAuto','totalGrace','useWacc','interestShield','refundVat','closeProject'].includes(key))return {range,type:'list',values:'0,1'};if(key==='periodFactor')return {range,type:'list',values:'1,12'};if(key==='repayment')return {range,type:'list',values:'0,1,2'};if(key==='years')return {range,type:'whole',min:1,max:30};if(key==='debtMonths')return {range,type:'whole',min:1,max:360};if(key==='graceMonths')return {range,type:'whole',min:0,max:359};if(key==='vatSettlementMonths')return {range,type:'whole',min:1,max:12};if(key==='usefulLifeYears')return {range,type:'decimal',min:1/12,max:100};if(key.endsWith('Days'))return {range,type:'decimal',min:0,max:365};if(key.endsWith('Growth'))return {range,type:'decimal',min:-99.99,max:100};if(['debtRate','ke','depreciationAnnualRate','vatRate','vatRecovery','vatFixedShare','taxRate','discountRate'].includes(key))return {range,type:'decimal',min:0,max:100};return {range,type:'decimal',min:0,max:1000000000000}}
export const downloadStudyWorkbook=(sheets:SheetInput[])=>buildXlsxBlob(sheets);

function applyResultColors(sheets:SheetInput[]){
 for(const index of [3,4,5,6]){const sheet=sheets[index];if(!sheet)continue;sheet.signedRanges=[];sheet.signedTotalRanges=[];
  sheet.rows.forEach((row,n)=>{if(index===4){if(row[1]&&typeof row[1]==='object'&&typeof row[1].value==='number')sheet.signedRanges!.push('B'+(n+1));return}if(n<44)return;
   const first=row[0];if(typeof first==='object'&&(first.style===3||first.style===8))return;
   if(row.length<3)return;const range='C'+(n+1)+':'+column(row.length-1)+(n+1);(typeof first==='object'&&first.style===7?sheet.signedTotalRanges!:sheet.signedRanges!).push(range);
  });
 }
}

function attachActivityInputs(sheets:SheetInput[],input:StudyAssumptions,index:number){
 if(input.activityLines===undefined)return;
 const sheet=sheets[0],copy=studyActivityCopy,start=sheet.rows.length+3;
 while(sheet.rows.length<start-1)sheet.rows.push([]);
 sheet.rows.push([{value:copy.products[index],style:3},'','','','','','ACTIVITY_MODE']);
 sheet.rows.push([copy.description[index],copy.units[index],copy.price[index],copy.cost[index]].map(value=>({value,style:3})));
 const references=input.activityLines.map((line,n)=>{
  const row=start+2+n;sheet.rows.push([{value:line.description,style:2},{value:line.units,style:2},{value:line.price,style:2},{value:line.unitCost,style:2},'',line.id,'ACTIVITY_LINE']);
  return {row,units:address(studySheets[0],row,1),price:address(studySheets[0],row,2),cost:address(studySheets[0],row,3)};
 });
 const units=add(...references.map(line=>line.units)),revenue=add(...references.map(line=>mul(line.units,line.price))),cost=add(...references.map(line=>mul(line.units,line.cost)));
 const expressions={units,price:when(eq(units,0),0,div(revenue,units)),unitCost:when(eq(units,0),0,div(cost,units))};
 sheet.validations=(sheet.validations||[]).filter(validation=>!sheet.rows.some((row,n)=>['units','price','unitCost'].includes(String(row[6]))&&validation.range==='C'+(n+1)));
 for(const [n,row] of sheet.rows.entries()){const key=String(row[6]);if(key==='units'||key==='price'||key==='unitCost')row[2]={formula:formula(expressions[key]),value:input[key],style:1};}
 for(const line of references)for(const column of ['B','C','D'])sheet.validations.push({range:column+line.row,type:'decimal',min:0,max:1000000000000});
}
