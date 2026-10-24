import type {WorkspaceDomain} from './workspace-navigation';
export type BiPanel={id:string;source:string;group:string};
export const biPanels:readonly BiPanel[]=[
 {id:'Cockpit CFO',source:'Cockpit CFO',group:'analysis'},
 {id:'Demonstrações',source:'Demonstrações',group:'analysis'},
 {id:'Performance Financeira',source:'Performance Financeira',group:'analysis'},
 {id:'Desvios Financeiros',source:'Desvios Financeiros',group:'analysis'},
 {id:'Rentabilidade',source:'Rentabilidade',group:'analysis'},
 {id:'bi:budget',source:'Mapa Orçamental Anual',group:'budget'},
 {id:'bi:study',source:'Investimento',group:'model'},
 {id:'bi:consolidation',source:'Consolidação',group:'consolidation'},
 {id:'Working Capital',source:'Working Capital',group:'liquidity'},
 {id:'bi:treasury',source:'Tesouraria',group:'liquidity'},
 {id:'bi:bank',source:'Extratos bancários',group:'liquidity'},
 {id:'RH Dashboard',source:'RH Dashboard',group:'people'},
 {id:'Análises',source:'Análises',group:'cost'},
];
// The operational navigation catalog remains the authority for entitlements.
export function availableBiPanels(domains:WorkspaceDomain[]){
 const allowed=new Set(domains.flatMap(domain=>domain.groups.flatMap(group=>group.targets)));
 return biPanels.filter(panel=>allowed.has(panel.source));
}
export function isBiDestination(target:string){return biPanels.some(panel=>panel.id===target)}
export function biWorkTarget(panel:BiPanel){
 const targets:Record<string,string>={'RH Dashboard':'Pessoas','Análises':'Headcount','bi:bank':'Extratos bancários','bi:treasury':'Tesouraria','bi:budget':'Mapa Orçamental Anual','bi:study':'Investimento','bi:consolidation':'Consolidação'};
 return targets[panel.id]||(panel.group==='liquidity'?'Tesouraria':'Dados financeiros');
}
