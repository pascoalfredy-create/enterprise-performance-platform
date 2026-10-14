// Accept unambiguous decimal forms and conventional grouped forms with both separators.
// A lone three-digit suffix (12,345 / 12.345) is ambiguous and must be rejected.
export function parseMoneyMinor(value:string):number {
 let s=String(value).trim().replace(/\s/g,"");
 if(s.includes(',')&&s.includes('.')) {
   const decimal=s.lastIndexOf(',')>s.lastIndexOf('.')?',':'.',group=decimal===','?'.':',';
   const parts=s.split(decimal);if(parts.length!==2||!/^\d{1,2}$/.test(parts[1]))throw new Error('invalid monetary amount');
   const sign=parts[0].startsWith('-')?'-':'',whole=parts[0].replace(/^-/,'');
   if(!new RegExp('^\\d{1,3}(\\'+group+'\\d{3})+$').test(whole))throw new Error('invalid thousands grouping');
   s=sign+whole.split(group).join('')+'.'+parts[1];
 } else s=s.replace(',','.');
 if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw new Error('invalid monetary amount');
 const negative=s.startsWith('-'),[whole,decimal='']=s.replace(/^-/,'').split('.');
 const amount=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(amount))throw new Error('invalid monetary amount');
 return negative?-amount:amount;
}
export function isCurrency(code:string):boolean {return Intl.supportedValuesOf('currency').includes(code)}
