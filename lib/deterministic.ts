export function percentageAmount(baseMinor:number,rateBps:number){return Math.trunc((baseMinor*rateBps+5000)/10000)}
export function workforceTotal(grossMinor:number,employerMinor:number){return grossMinor+employerMinor}
export function variance(actualMinor:number,budgetMinor:number){return actualMinor-budgetMinor}
export function varianceBps(actualMinor:number,budgetMinor:number){return budgetMinor?Math.trunc((actualMinor-budgetMinor)*10000/budgetMinor):null}
