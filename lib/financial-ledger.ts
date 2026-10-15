export const balanceAccounts=['CASH','AR','INVENTORY','TAX_ASSET','OTHER_CA','FIXED','DEPRECIATION_ACCUM','OTHER_NCA','AP','TAX_PAYABLE','SHORT_DEBT','OTHER_CL','LONG_DEBT','OTHER_NCL','CAPITAL','RETAINED'] as const;
export type BalanceAccount=typeof balanceAccounts[number];
export const incomeAccounts=['REVENUE','COGS','OPEX','DEPRECIATION','INTEREST','TAX'] as const;
export type Account=BalanceAccount|typeof incomeAccounts[number];
export const operationKinds=['saleCredit','saleCash','revenueReturnCash','revenueReturnCredit','costReturnCash','costReturnCredit','costCredit','costCash','assetCredit','assetCash','inventoryCredit','inventoryCash','consumeInventory','depreciation','loanIn','loanRepay','capitalIn','dividend','taxDue','withholding','taxRecovery','settle','taxOffset'] as const;
export type Operation={id:string;book_id:string;operation_date:string;kind:string;amount_minor:number;tax_minor:number;due_date:string|null;tax_due_date:string|null;party:string;category:string;description:string;reference:string;target_id:string|null;cash_activity:string;actual_entry_id:string|null;cost_role:string;voided?:number};
export type Book={id:string;organization_id:string;organization_name?:string;currency:string;opening_date:string;balances_json:string;reference:string;revision:number};
export type Obligation={id:string;book_id:string;organization_id:string;kind:'AR'|'AP'|'TAX';date:string;due:string|null;party:string;reference:string;description:string;amount:number;settled:number;outstanding:number;overdueDays:number|null;opening:boolean};
const credits=new Set<Account>(['AP','TAX_PAYABLE','SHORT_DEBT','OTHER_CL','LONG_DEBT','OTHER_NCL','CAPITAL','RETAINED','DEPRECIATION_ACCUM','REVENUE']);
export function integer(value:number){if(!Number.isSafeInteger(value))throw new Error('invalid financial numeric range');return value}
export function openingBalances(raw:Record<string,number>){const values=Object.fromEntries(balanceAccounts.map(key=>[key,integer(raw[key]??0)])) as Record<BalanceAccount,number>;if(Object.keys(raw).some(key=>!balanceAccounts.includes(key as BalanceAccount)))throw new Error('invalid opening account');if(balanceAccounts.some(key=>!['CAPITAL','RETAINED'].includes(key)&&values[key]<0)||values.FIXED<values.DEPRECIATION_ACCUM)throw new Error('invalid opening balances');const difference=balanceAccounts.reduce((sum,key)=>integer(sum+values[key]*(credits.has(key)?-1:1)),0);if(difference!==0)throw new Error('opening balance does not reconcile');return values}
export function previousMonth(period:string){const date=new Date(period+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);return date.toISOString().slice(0,7)}
export function periodEnd(period:string){return new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10)}
export function financialLedger(book:Book,all:Operation[],period:string,asOfDate=periodEnd(period),basis:'month'|'ytd'='month'){
 const requestedFirst=basis==='ytd'?period.slice(0,4)+'-01-01':period+'-01',first=book.opening_date>requestedFirst?book.opening_date:requestedFirst,last=asOfDate<periodEnd(period)?asOfDate:periodEnd(period),opening=openingBalances(JSON.parse(book.balances_json)),ops=all.filter(op=>!op.voided).sort((a,b)=>a.operation_date.localeCompare(b.operation_date)||a.id.localeCompare(b.id)),docs=new Map<string,Obligation>();
 const makeDoc=(id:string,kind:Obligation['kind'],op:{operation_date:string;due_date:string|null;party:string;reference:string;description:string},amount:number,isOpening=false)=>{docs.set(id,{id,book_id:book.id,organization_id:book.organization_id,kind,date:op.operation_date,due:op.due_date,party:op.party,reference:op.reference,description:op.description,amount,settled:0,outstanding:amount,overdueDays:null,opening:isOpening})};
 for(const kind of ['AR','AP','TAX'] as const){const amount=opening[kind==='TAX'?'TAX_PAYABLE':kind];if(amount>0)makeDoc(book.id+':'+kind,kind,{operation_date:book.opening_date,due_date:null,party:'Saldo inicial',reference:book.reference,description:'Saldo inicial sem detalhe de vencimento'},amount,true)}
 for(const op of ops){if(op.operation_date>last)continue;const gross=integer(op.amount_minor+op.tax_minor);
  if(op.kind==='saleCredit')makeDoc(op.id,'AR',op,gross);
  if(['costCredit','assetCredit','inventoryCredit'].includes(op.kind))makeDoc(op.id,'AP',op,gross);
  if(['saleCredit','saleCash'].includes(op.kind)&&op.tax_minor)makeDoc(op.id+':tax','TAX',{...op,due_date:op.tax_due_date},op.tax_minor);
  if(['taxDue','withholding'].includes(op.kind))makeDoc(op.id,'TAX',op,op.amount_minor);
 }
 const journals:{op:Operation;lines:[Account,number][]}[]=[];
 for(const op of ops){if(op.operation_date>last)continue;if(op.operation_date<book.opening_date)throw new Error('operation before opening date');const a=op.amount_minor,t=op.tax_minor,g=integer(a+t),lines:[Account,number][]=[];
  const post=(debit:Account,credit:Account,amount:number)=>{lines.push([debit,amount],[credit,-amount])};
  switch(op.kind){
   case 'saleCredit':case 'saleCash':lines.push([op.kind==='saleCash'?'CASH':'AR',g],['REVENUE',-a]);if(t)lines.push(['TAX_PAYABLE',-t]);break;
   case 'costCredit':case 'costCash':{const role=incomeAccounts.includes(op.cost_role as typeof incomeAccounts[number])&&op.cost_role!=='REVENUE'?op.cost_role as Account:'OPEX';lines.push([role,a],[op.kind==='costCash'?'CASH':'AP',-g]);if(t)lines.push(['TAX_ASSET',t]);break;}
   case 'assetCredit':case 'assetCash':case 'inventoryCredit':case 'inventoryCash':lines.push([op.kind.startsWith('asset')?'FIXED':'INVENTORY',a],[op.kind.endsWith('Cash')?'CASH':'AP',-g]);if(t)lines.push(['TAX_ASSET',t]);break;
   case 'consumeInventory':post('COGS','INVENTORY',a);break;
   case 'depreciation':post('DEPRECIATION','DEPRECIATION_ACCUM',a);break;
   case 'loanIn':post('CASH',op.cost_role==='SHORT_DEBT'?'SHORT_DEBT':'LONG_DEBT',a);break;
   case 'loanRepay':post(op.cost_role==='SHORT_DEBT'?'SHORT_DEBT':'LONG_DEBT','CASH',a);break;
   case 'capitalIn':post('CASH','CAPITAL',a);break;
   case 'dividend':post('RETAINED','CASH',a);break;
   case 'taxDue':post(op.cost_role==='OPEX'?'OPEX':'TAX','TAX_PAYABLE',a);break;
   case 'revenueReturnCash':post('REVENUE','CASH',a);break;
   case 'costReturnCash':post('CASH',op.cost_role as Account,a);break;
   case 'taxRecovery':post('CASH','TAX_ASSET',a);break;
   case 'settle':case 'taxOffset':case 'withholding':case 'revenueReturnCredit':case 'costReturnCredit':{
    const doc=docs.get(op.target_id||'');if(!doc||doc.date>op.operation_date||op.target_id===op.id)throw new Error('invalid settlement document');
    doc.settled=integer(doc.settled+a);doc.outstanding=integer(doc.amount-doc.settled);if(doc.outstanding<0)throw new Error('settlement exceeds outstanding balance');
    if(op.kind==='revenueReturnCredit'){if(doc.kind!=='AR')throw new Error('invalid revenue credit document');post('REVENUE','AR',a)}
    else if(op.kind==='costReturnCredit'){if(doc.kind!=='AP')throw new Error('invalid cost credit document');post('AP',op.cost_role as Account,a)}
    else if(op.kind==='withholding'){if(doc.kind!=='AP')throw new Error('invalid withholding document');post('AP','TAX_PAYABLE',a)}
    else if(op.kind==='taxOffset'){if(doc.kind!=='TAX')throw new Error('invalid tax offset');post('TAX_PAYABLE','TAX_ASSET',a)}
    else if(doc.kind==='AR')post('CASH','AR',a);else post(doc.kind==='AP'?'AP':'TAX_PAYABLE','CASH',a);break;
   }
   default:throw new Error('invalid financial operation');
  }
  if(lines.reduce((sum,[,value])=>integer(sum+value),0)!==0)throw new Error('journal does not reconcile');journals.push({op,lines});
 }
 const daily=new Map<string,[Account,number][]>();for(const journal of journals){const lines=daily.get(journal.op.operation_date)||[];lines.push(...journal.lines);daily.set(journal.op.operation_date,lines)}
 const running:Record<string,number>=Object.fromEntries(balanceAccounts.map(key=>[key,opening[key]*(credits.has(key)?-1:1)])),invalidTimelineDates:{date:string;accounts:string[]}[]=[];
 for(const [date,lines] of daily){for(const [account,value] of lines)running[account]=integer((running[account]||0)+value);const value=(key:Account)=>(running[key]||0)*(credits.has(key)?-1:1),invalid=['CASH','AR','AP','TAX_PAYABLE','TAX_ASSET','INVENTORY','FIXED','SHORT_DEBT','LONG_DEBT'].filter(key=>value(key as Account)<0);if(value('FIXED')<value('DEPRECIATION_ACCUM'))invalid.push('NET_FIXED');if(invalid.length)invalidTimelineDates.push({date,accounts:invalid})}
 const at=(date:string)=>{const balances:Record<string,number>=Object.fromEntries(balanceAccounts.map(key=>[key,opening[key]*(credits.has(key)?-1:1)]));for(const {op,lines} of journals)if(op.operation_date<=date)for(const [account,value] of lines)balances[account]=integer((balances[account]||0)+value);const n=(key:Account)=>(balances[key]||0)*(credits.has(key)?-1:1),profit=n('REVENUE')-incomeAccounts.filter(key=>key!=='REVENUE').reduce((sum,key)=>integer(sum+n(key)),0),currentAssets=integer(n('CASH')+n('AR')+n('INVENTORY')+n('TAX_ASSET')+n('OTHER_CA')),noncurrentAssets=integer(n('FIXED')-n('DEPRECIATION_ACCUM')+n('OTHER_NCA')),currentLiabilities=integer(n('AP')+n('TAX_PAYABLE')+n('SHORT_DEBT')+n('OTHER_CL')),noncurrentLiabilities=integer(n('LONG_DEBT')+n('OTHER_NCL')),equity=integer(n('CAPITAL')+n('RETAINED')+profit),assets=integer(currentAssets+noncurrentAssets),liabilities=integer(currentLiabilities+noncurrentLiabilities);return {accounts:Object.fromEntries(balanceAccounts.map(key=>[key,n(key)])),profit,currentAssets,noncurrentAssets,currentLiabilities,noncurrentLiabilities,assets,liabilities,equity,difference:integer(assets-liabilities-equity)}};
 const startDate=new Date(first+'T00:00:00Z');startDate.setUTCDate(0);const before=startDate.toISOString().slice(0,10),bs=at(last),prior=at(before),income=Object.fromEntries(incomeAccounts.map(key=>[key,0])) as Record<typeof incomeAccounts[number],number>,cash:Record<'Operacional'|'Investimento'|'Financiamento',number>={Operacional:0,Investimento:0,Financiamento:0},cashDetails:Record<string,{incoming:number;outgoing:number}>={Operacional:{incoming:0,outgoing:0},Investimento:{incoming:0,outgoing:0},Financiamento:{incoming:0,outgoing:0}};
 for(const {op,lines} of journals){if(op.operation_date<first)continue;for(const [account,value] of lines){if(incomeAccounts.includes(account as typeof incomeAccounts[number]))income[account as typeof incomeAccounts[number]]=integer(income[account as typeof incomeAccounts[number]]+value*(account==='REVENUE'?-1:1));if(account==='CASH'){cash[op.cash_activity as keyof typeof cash]=integer(cash[op.cash_activity as keyof typeof cash]+value);const side=value>0?'incoming':'outgoing';cashDetails[op.cash_activity][side]=integer(cashDetails[op.cash_activity][side]+Math.abs(value))}}}
 const gross=integer(income.REVENUE-income.COGS),ebitda=integer(gross-income.OPEX),ebit=integer(ebitda-income.DEPRECIATION),pbt=integer(ebit-income.INTEREST),net=integer(pbt-income.TAX),netCash=integer(cash.Operacional+cash.Investimento+cash.Financiamento),cashDifference=integer(prior.accounts.CASH+netCash-bs.accounts.CASH),ratio=(a:number,b:number)=>b>0?a/b:null;
 const obligations=[...docs.values()].map(doc=>({...doc,overdueDays:doc.due&&doc.outstanding>0&&doc.due<last?Math.round((Date.parse(last)-Date.parse(doc.due))/86400000):null}));
 const invalidBalances=['CASH','AR','AP','TAX_PAYABLE','TAX_ASSET','INVENTORY','FIXED','SHORT_DEBT','LONG_DEBT'].filter(key=>bs.accounts[key]<0);if(bs.accounts.FIXED<bs.accounts.DEPRECIATION_ACCUM)invalidBalances.push('NET_FIXED');
 return {bookId:book.id,organizationId:book.organization_id,period,basis,startDate:first,requestedStartDate:requestedFirst,asOf:last,currency:book.currency,openingDate:book.opening_date,covered:requestedFirst>=book.opening_date&&first<=last,balance:bs,priorBalance:prior,income:{...income,gross,ebitda,ebit,pbt,net},cashFlow:{...cash,details:cashDetails,inflows:Object.values(cashDetails).reduce((s,x)=>s+x.incoming,0),outflows:Object.values(cashDetails).reduce((s,x)=>s+x.outgoing,0),opening:prior.accounts.CASH,net:netCash,closing:bs.accounts.CASH,difference:cashDifference},obligations,invalidBalances,ratios:{current:ratio(bs.currentAssets,bs.currentLiabilities),quick:ratio(bs.currentAssets-bs.accounts.INVENTORY,bs.currentLiabilities),debtAssets:ratio(bs.liabilities,bs.assets),equityAssets:ratio(bs.equity,bs.assets),netMargin:ratio(net,income.REVENUE),workingCapital:bs.currentAssets-bs.currentLiabilities},invalidTimelineDates,journalCount:journals.length};
}
export function horizontal(current:number|null,previous:number|null){return {current,previous,delta:current===null||previous===null?null:integer(current-previous),percent:current===null||previous===null||previous===0?null:(current-previous)/Math.abs(previous)*100}}
