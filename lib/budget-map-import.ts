import {parseMoneyMinor} from './money.ts';

export type BudgetImportLine={code:string;name:string;line_kind:string;leaf:boolean};

export function budgetMinorDecimal(minor:number){
 if(!Number.isSafeInteger(minor))throw new Error('amount');
 const n=BigInt(minor),absolute=n<0n?-n:n;
 return `${n<0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
}

// Validate the entire workbook before constructing any write request. Empty
// cells preserve existing amounts; an explicit zero remains an actual edit.
export function parseBudgetMapImport(rows:string[][],periods:string[],lines:BudgetImportLine[],currency:string,dimensionMemberId:string|null){
 if(rows.length<2||periods.length!==12||periods.some((p,i)=>rows[0]?.[i+2]?.trim()!==p))throw new Error('periods');
 const byCode=new Map(lines.map(l=>[l.code.toUpperCase(),l]));
 const seen=new Set<string>();
 const cells:{code:string;lineName:string;period:string;currency:string;dimensionMemberId:string|null;amount:string}[]=[];
 let ignoredGroups=0;
 for(const row of rows.slice(1)){
  const code=row[0]?.trim().toUpperCase();if(!code)continue;
  if(seen.has(code))throw new Error('duplicate');seen.add(code);
  const line=byCode.get(code);if(!line)throw new Error('rubric');
  if(!line.leaf||line.line_kind!=='Analítica'){ignoredGroups++;continue;}
  for(let i=0;i<12;i++){
   const raw=row[i+2]?.trim();if(!raw)continue;
   const minor=parseMoneyMinor(raw);
   cells.push({code,lineName:line.name,period:periods[i],currency,dimensionMemberId,amount:budgetMinorDecimal(minor)});
  }
 }
 if(!cells.length)throw new Error('empty');
 return {cells,ignoredGroups};
}
