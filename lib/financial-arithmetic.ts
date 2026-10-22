// Shared period and integer-money arithmetic. Business-specific timing, signs,
// validation and drivers remain in the engine that owns each model.
export function periodAdd(period:string,months:number):string{
 const [year,month]=period.split('-').map(Number),index=year*12+month-1+months;
 return `${Math.floor(index/12)}-${String((index%12)+1).padStart(2,'0')}`;
}
export function compoundMinor(base:number,growthBps:number,steps:number):number{
 let value=BigInt(base);
 const numerator=BigInt(10000+growthBps),denominator=10000n;
 for(let i=0;i<steps;i++){
  const product=value*numerator;
  value=product>=0n?(product+denominator/2n)/denominator:-((-product+denominator/2n)/denominator);
 }
 return Number(value);
}
export function applyBps(amount:number,bps:number):number{
 const n=BigInt(Math.trunc(amount))*BigInt(Math.trunc(bps)),d=10000n;
 return Number(n>=0n?(n+d/2n)/d:-((-n+d/2n)/d));
}
