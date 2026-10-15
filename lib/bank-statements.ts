import {parseMoneyMinor,isCurrency} from './money';
import {parseCsvLine} from './assisted-import';
import {validTreasuryDate} from './treasury-engine';
export type BankMovement={date:string;description:string;reference:string;iban:string;incoming:number;outgoing:number;balance:number|null;category:string;row:number};
export type BankStatement={bank:string;account:string;currency:string;start:string;end:string;opening:number;closing:number;movements:BankMovement[]};
export const bankCategories=['Combustível','Salários','Impostos','Comissões bancárias','Rendas','Energia e água','Telecomunicações','Seguros','Transportes','Clientes','Fornecedores','Transferências','Outros'] as const;
const clean=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const ibanLengths:Record<string,number>={AO:25,PT:25,GB:22,DE:22,FR:27,ES:24,IT:27,NL:18,BE:16,CH:21,LU:20,AE:23};
export function normalizeIban(value:string){const normalized=value.toUpperCase().replace(/[\s.-]/g,'');return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)&&(!ibanLengths[normalized.slice(0,2)]||ibanLengths[normalized.slice(0,2)]===normalized.length)?normalized:''}
export function extractBankIban(description:string){
 const country=description.match(/\b([A-Z]{2})[\s.-]*\d{2}/i)?.[1]?.toUpperCase();if(!country)return '';
 const length=ibanLengths[country];const pattern=length?new RegExp('\\b'+country+'(?:[\\s.-]*[A-Z0-9]){'+(length-2)+'}(?![A-Z0-9])','i'):/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i;
 return normalizeIban(description.match(pattern)?.[0]||'');
}
export function classifyBankDescription(description:string){
 const text=clean(description.replace(/\b[A-Z]{2}\d{2}(?:[\s.-]*[A-Z0-9]){11,30}\b/gi,''));
 const rules:[RegExp,string][]=[[/combust|gasoleo|gasolina|fuel|diesel|sonangol/,'Combustível'],[/salari|ordenad|vencimento|payroll|salary/,'Salários'],[/imposto|\bagt\b|\biva\b|\birt\b|\binss\b|tax payment/,'Impostos'],[/comiss|encargo|bank fee|maintenance fee|manutencao.*conta/,'Comissões bancárias'],[/renda|aluguer|aluguel|\brent\b/,'Rendas'],[/energia|electric|eletric|\bende\b|\bepal\b|water/,'Energia e água'],[/telecom|internet|unitel|africell|movicel/,'Telecomunicações'],[/seguro|insurance/,'Seguros'],[/transporte|frete|logistic/,'Transportes'],[/cliente|customer|venda|sales/,'Clientes'],[/fornecedor|supplier/,'Fornecedores']];
 return rules.find(([pattern])=>pattern.test(text))?.[1]||'Outros';
}
const safe=(value:number)=>{if(!Number.isSafeInteger(value))throw new Error('Extrato: valor fora do intervalo permitido.');return value};
function amount(value:string){let s=value.trim().replace(/(?:AOA|AKZ|KZ|USD|EUR|GBP|\$|€)/gi,'').trim();let sign=1;if(/^\(.*\)$/.test(s)){sign=-1;s=s.slice(1,-1)}if(/\s*[dD]$/.test(s)){sign=-1;s=s.replace(/\s*[dD]$/,'')}else s=s.replace(/\s*[cC]$/,'');return safe(sign*parseMoneyMinor(s.replace(/^\+/,'')))}
function date(value:string){let s=value.trim();if(/^\d{5}(?:\.0+)?$/.test(s)){const serial=Number(s);if(serial<61||serial>100000)throw new Error('Extrato: data inválida.');s=new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10)}else if(/^\d{2}[/.\-]\d{2}[/.\-]\d{4}$/.test(s)){const [day,month,year]=s.split(/[/.\-]/);s=year+'-'+month+'-'+day}else s=s.slice(0,10);if(!validTreasuryDate(s))throw new Error('Extrato: data inválida: '+value);return s}
const aliases:Record<string,string>={data:'date',datamovimento:'date',datamov:'date',datacontabilistica:'date',bookingdate:'date',transactiondate:'date',date:'date',descricao:'description',descritivo:'description',description:'description',detalhes:'description',historico:'description',narrative:'description',valor:'amount',montante:'amount',amount:'amount',credito:'incoming',credit:'incoming',entradas:'incoming',entrada:'incoming',recebimentos:'incoming',debito:'outgoing',debit:'outgoing',saidas:'outgoing',saida:'outgoing',pagamentos:'outgoing',saldo:'balance',saldocontabilistico:'balance',balance:'balance',runningbalance:'balance',iban:'iban',ibancontraparte:'iban',ibanbeneficiario:'iban',counterpartyiban:'iban',referencia:'reference',reference:'reference',documento:'reference',ref:'reference',banco:'bank',bank:'bank',moeda:'currency',currency:'currency',conta:'account',account:'account',ibanconta:'account',accountiban:'account'};
const header=(s:string)=>aliases[clean(s).replace(/[^a-z0-9]/g,'')];
export function bankCsvRows(raw:string){
 if(raw.length>5000000)throw new Error('Extrato: ficheiro demasiado grande.');
 const first=raw.replace(/^\uFEFF/,'').split(/\r?\n/).find(line=>[',',';','\t'].some(d=>line.includes(d)))||'';
 const delimiter=[';','\t',','].sort((a,b)=>parseCsvLine(first,b).length-parseCsvLine(first,a).length)[0];
 // Preserve quoted newlines and reject malformed quoting instead of splitting a transaction.
 const lines:string[]=[];let current='',quoted=false;for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='"'){if(quoted&&raw[i+1]==='"'){current+='""';i++;continue}quoted=!quoted}if((c==='\n'||c==='\r')&&!quoted){if(current.trim())lines.push(current);current='';if(c==='\r'&&raw[i+1]==='\n')i++;}else current+=c}if(quoted)throw new Error('Extrato: aspas incompletas.');if(current.trim())lines.push(current);
 return lines.map(line=>parseCsvLine(line.replace(/^\uFEFF/,''),delimiter));
}
export function parseBankRows(rows:string[][]):BankStatement{
 if(!rows.length||rows.length>2040)throw new Error('Extrato: máximo de 2 000 movimentos.');
 const headerIndex=rows.findIndex(row=>{const fields=row.map(header);return fields.includes('date')&&fields.includes('description')&&(fields.includes('amount')||fields.includes('incoming')||fields.includes('outgoing'))});
 if(headerIndex<0)throw new Error('Extrato: faltam colunas de data, descrição e valor ou débito/crédito.');
 const fields=rows[headerIndex].map(header),at=(cells:string[],field:string)=>cells[fields.indexOf(field)]?.trim()||'';
 let bank='',account='',currency='',opening:number|null=null,closing:number|null=null;const movements:BankMovement[]=[];
 function metadata(cells:string[]){const key=clean(cells[0]||'').replace(/[:\s]/g,''),value=cells.slice(1).find(x=>x.trim())||'';
  if(['banco','bank'].includes(key))bank=value;if(['conta','account','iban','ibanconta'].includes(key))account=normalizeIban(value)||value.trim();if(['moeda','currency'].includes(key))currency=value.toUpperCase().replace('AKZ','AOA');
  if(['saldoinicial','openingbalance','saldotransportado','saldoinicio'].includes(key))opening=amount(value);
  if(['saldofinal','closingbalance','saldoactual','saldoatual'].includes(key))closing=amount(value);
 }
 for(const row of rows.slice(0,headerIndex))metadata(row);
 for(let index=headerIndex+1;index<rows.length;index++){
  const cells=rows[index];if(!cells.some(x=>x.trim()))continue;
  const first=clean(cells[0]||'').replace(/[:\s]/g,'');if(['saldoinicial','openingbalance','saldotransportado','saldoinicio','saldofinal','closingbalance','saldoactual','saldoatual'].includes(first)){metadata(cells);continue}
  if(cells.map(header).join('|')===fields.join('|'))continue;
  const rawAmount=at(cells,'amount'),rawIn=at(cells,'incoming'),rawOut=at(cells,'outgoing');
  const rowDate=date(at(cells,'date'));let incoming=rawIn?amount(rawIn):0,outgoing=rawOut?amount(rawOut):0;
  if(rawAmount){if(rawIn||rawOut)throw new Error('Extrato: colunas de valor e débito/crédito simultâneas na linha '+(index+1));const value=amount(rawAmount);incoming=Math.max(0,value);outgoing=Math.max(0,-value)}
  if(incoming<0||outgoing<0||(incoming&&outgoing)||(!incoming&&!outgoing))throw new Error('Extrato: entrada ou saída inválida na linha '+(index+1));
  const description=at(cells,'description');if(!description||description.length>500)throw new Error('Extrato: descrição em falta ou demasiado longa.');
  const rawIban=at(cells,'iban');const found=rawIban||extractBankIban(description);const iban=normalizeIban(found);if(rawIban&&!iban)throw new Error('Extrato: IBAN inválido na linha '+(index+1));
  bank=bank||at(cells,'bank');account=account||normalizeIban(at(cells,'account'))||at(cells,'account');currency=currency||at(cells,'currency').toUpperCase().replace('AKZ','AOA');
  if((at(cells,'bank')&&at(cells,'bank')!==bank)||(at(cells,'account')&&(normalizeIban(at(cells,'account'))||at(cells,'account'))!==account)||(at(cells,'currency')&&at(cells,'currency').toUpperCase().replace('AKZ','AOA')!==currency))throw new Error('Extrato: importe uma única conta, banco e moeda por ficheiro.');
  movements.push({date:rowDate,description,reference:at(cells,'reference'),iban,incoming,outgoing,balance:at(cells,'balance')?amount(at(cells,'balance')):null,category:classifyBankDescription(description),row:index+1});
 }
 if(!movements.length||movements.length>2000)throw new Error('Extrato: 1–2 000 movimentos.');
 if(movements.some((row,i)=>i>0&&row.date<movements[i-1].date)){if(movements.every((row,i)=>!i||row.date<=movements[i-1].date))movements.reverse();else throw new Error('Extrato: ordene os movimentos cronologicamente.');}
 const net=movements.reduce((sum,row)=>safe(sum+row.incoming-row.outgoing),0);
 if(opening===null&&movements[0].balance!==null)opening=safe(movements[0].balance-movements[0].incoming+movements[0].outgoing);
 if(closing===null&&movements.at(-1)!.balance!==null)closing=movements.at(-1)!.balance;
 if(opening===null&&closing!==null)opening=safe(closing-net);if(closing===null&&opening!==null)closing=safe(opening+net);
 if(opening===null||closing===null)throw new Error('Extrato: o ficheiro precisa de saldo inicial, final ou saldos por movimento. Não é necessário lançar saldos manualmente.');
 let running=opening;for(const row of movements){running=safe(running+row.incoming-row.outgoing);if(row.balance!==null&&row.balance!==running)throw new Error('Extrato: saldo não reconcilia na linha '+row.row)}if(running!==closing)throw new Error('Extrato: saldo inicial + entradas − saídas difere do saldo final.');
 if(currency&&!isCurrency(currency))throw new Error('Extrato: moeda inválida.');
 return {bank,account,currency,start:movements[0].date,end:movements.at(-1)!.date,opening,closing,movements};
}
export function parseBankOfx(raw:string):BankStatement{
 const get=(source:string,key:string)=>source.match(new RegExp('<'+key+'>\\s*([^<\\r\\n]+)','i'))?.[1]?.trim()||'';
 const blocks=[...raw.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi)].map(m=>m[1]);
 const closing=get(raw.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|$)/i)?.[1]||'','BALAMT');
 const rows=[['Banco',get(raw,'ORG')||get(raw,'BANKID')],['Conta',get(raw,'ACCTID')],['Moeda',get(raw,'CURDEF')],...(closing?[['Saldo final',closing]]:[]),['data','descricao','valor','referencia'],...blocks.map(block=>{const d=get(block,'DTPOSTED');return [d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8),get(block,'MEMO')||get(block,'NAME')||get(block,'FITID'),get(block,'TRNAMT'),get(block,'FITID')]})];
 const result=parseBankRows(rows);const balanceDate=get(raw.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|$)/i)?.[1]||'','DTASOF').slice(0,8);if(balanceDate&&balanceDate!==result.end.replaceAll('-',''))throw new Error('Extrato: a data do saldo OFX não coincide com o último movimento. Exporte o período completo.');return result;
}
export function summarizeBank(movements:BankMovement[]){
 const groups=new Map<string,{key:string;iban:string;category:string;count:number;incoming:number;outgoing:number;net:number;rows:number[]}>();
 for(const row of movements){const key=row.iban?'IBAN:'+row.iban:'CATEGORY:'+row.category;const group=groups.get(key)||{key,iban:row.iban,category:row.category,count:0,incoming:0,outgoing:0,net:0,rows:[]};group.count++;group.incoming=safe(group.incoming+row.incoming);group.outgoing=safe(group.outgoing+row.outgoing);group.net=safe(group.incoming-group.outgoing);group.rows.push(row.row);if(group.category!==row.category)group.category='Outros';groups.set(key,group)}
 return [...groups.values()].sort((a,b)=>b.incoming+b.outgoing-a.incoming-a.outgoing);
}
export const bankStatementTemplate='Banco;Banco de exemplo\nConta;CONTA-001\nMoeda;AOA\nSaldo inicial;100000.00\ndata;descricao;debito;credito;saldo;iban;referencia\n2026-10-01;Combustível;10000.00;;90000.00;;DOC-01\n2026-10-02;Transferência AO06000600000123456789012;;5000.00;95000.00;AO06000600000123456789012;DOC-02\n';
