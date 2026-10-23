import {type PlanningResult,studySheets,planningDreRows,planningBalanceRows,planningCashRows} from './feasibility-planning';
import {type Expr,address,add,sub,mul,round} from './study-model';
export const statementCopy={
 source:['Projeções calculadas a partir dos pressupostos do estudo.','Projections calculated from study assumptions.','Proyecciones calculadas a partir de las premisas del estudio.','Projections calculées à partir des hypothèses de l’étude.','Прогноз рассчитан на основе допущений исследования.'],
 note:['Custos variáveis e fixos mantêm a classificação agregada dos pressupostos. Não se atribuem automaticamente a CMVMC, FSE ou pessoal sem detalhe de origem. Impostos seguem as taxas configuradas; não são aplicados regimes fiscais portugueses.','Variable and fixed costs retain their assumption-level aggregation. COGS, external services and personnel are not inferred without source detail. Tax follows configured rates.','Los costes mantienen la agregación de las premisas, sin inferir CMVMC, servicios o personal. Impuestos según las tasas configuradas.','Les coûts restent agrégés selon les hypothèses, sans ventilation inventée. Impôts selon les taux configurés.','Затраты остаются агрегированными по предпосылкам без вымышленного распределения. Налоги по заданным ставкам.'],
 year:['Ano','Year','Año','Année','Год'],item:['Rubrica','Item','Partida','Rubrique','Статья']
};
type Labels=[string,string,string,string,string];
export type StatementLine={id:string;label:Labels;kind:'line'|'section'|'subtotal'|'total'|'check';value?:(year:number)=>Expr};
export function statementLayouts(p:PlanningResult){
 const at=(part:'dre'|'balance'|'cash',key:string,m:number)=>{const rows=part==='dre'?planningDreRows:part==='balance'?planningBalanceRows:planningCashRows;return address(studySheets[part==='dre'?1:part==='balance'?2:3],(rows as Record<string,number>)[key],m+2)};
 const sum=(part:'dre'|'cash',key:string,y:number):Expr=>y===0?at(part,key,0):add(...Array.from({length:12},(_,j)=>at(part,key,(y-1)*12+j+1)));
 const d=(k:string,y:number)=>sum('dre',k,y),c=(k:string,y:number)=>sum('cash',k,y),b=(k:string,y:number)=>at('balance',k,y*12);
 const line=(id:string,label:Labels,value?:StatementLine['value'],kind:StatementLine['kind']='line'):StatementLine=>({id,label,value,kind});
 const paidTax=(y:number):Expr=>y===0?b('taxPaid',0):add(...Array.from({length:12},(_,j)=>at('balance','taxPaid',(y-1)*12+j+1)));
 const op=(y:number):Expr=>y===0?mul(-1,b('nwc',0)):sub(sub(d('ebitda',y),paidTax(y)),c('wcChange',y));
 // Use live input references and horizon conditions in exported formulas.
 const P=(key:string)=>address(studySheets[0],p.inputRows.find(r=>r.key===key)!.row,2);
 const terminal=(y:number):Expr=>({op:'IF',args:[mul({op:'=',args:[y,P('years')]},P('closeProject')),P('residual'),0]});
 const debt=(y:number):Expr=>y===0?P('debt'):add(...Array.from({length:12},(_,j)=>at('balance','drawdown',(y-1)*12+j+1)));
 const finance=(y:number)=>sub(add(c('equityInjection',y),debt(y)),add(c('principal',y),c('interestPaid',y),c('financingFees',y),c('distribution',y)));
 const invest=(y:number)=>sub(terminal(y),d('assetCost',y));
 const movement=(y:number)=>add(op(y),finance(y),invest(y));
 const opening=(y:number):Expr=>y===0?0:at('balance','cash',(y-1)*12);
 return [
 {id:'dre',title:['Demonstração de resultados projetada','Projected income statement','Resultados proyectados','Résultat prévisionnel','Прогноз прибыли'] as Labels,lines:[
 line('revenue',['Vendas e serviços prestados','Sales and services','Ventas y servicios','Ventes et services','Выручка'],y=>d('revenue',y)),
 line('variable',['Custos variáveis de exploração','Variable operating costs','Costes variables','Coûts variables','Переменные затраты'],y=>mul(-1,d('variable',y))),
 line('fixed',['FSE, pessoal e outros gastos fixos — agregado','External services, personnel and other fixed costs — aggregated','Servicios, personal y otros costes fijos — agregados','Services, personnel et autres coûts fixes — agrégés','Услуги, персонал и прочие постоянные затраты — всего'],y=>mul(-1,d('fixed',y))),
 line('ebitda',['EBITDA — resultado antes de depreciações, financiamento e impostos','EBITDA','EBITDA','EBITDA','EBITDA'],y=>d('ebitda',y),'subtotal'),
 line('depreciation',['Depreciações e amortizações','Depreciation and amortisation','Depreciación y amortización','Amortissements','Амортизация'],y=>mul(-1,d('depreciation',y))),
 line('ebit',['EBIT — resultado operacional','EBIT — operating profit','EBIT — resultado operativo','EBIT — résultat opérationnel','EBIT — операционная прибыль'],y=>d('ebit',y),'subtotal'),
 line('disposal',['Outros resultados — alienação de ativos','Other results — asset disposals','Otros resultados — enajenaciones','Autres résultats — cessions','Прочие результаты — продажа активов'],y=>d('disposal',y)),
 line('interest',['Juros e gastos similares suportados','Interest expense','Gastos por intereses','Charges d’intérêts','Процентные расходы'],y=>mul(-1,d('interest',y))),
 line('fees',['Outros gastos de financiamento','Other financing costs','Otros gastos financieros','Autres charges financières','Прочие финансовые расходы'],y=>mul(-1,d('financingFees',y))),
 line('pbt',['EBT — resultado antes de impostos','EBT — profit before tax','EBT — resultado antes de impuestos','EBT — résultat avant impôt','EBT — прибыль до налога'],y=>add(d('pbt',y),d('disposal',y)),'subtotal'),
 line('tax',['Imposto sobre o rendimento','Income tax','Impuesto sobre beneficios','Impôt sur le résultat','Налог на прибыль'],y=>mul(-1,d('tax',y))),
 line('net',['Resultado líquido do período','Net profit for the period','Resultado neto','Résultat net','Чистая прибыль'],y=>d('net',y),'total')
 ]},
 {id:'balance',title:['Balanço projetado','Projected balance sheet','Balance proyectado','Bilan prévisionnel','Прогнозный баланс'] as Labels,lines:[
 line('asset',['ATIVO','ASSETS','ACTIVO','ACTIF','АКТИВЫ'],undefined,'section'),
 line('noncurrent',['Ativo não corrente','Non-current assets','Activo no corriente','Actif non courant','Внеоборотные активы'],y=>b('fixedAssets',y),'subtotal'),
 line('fixedAssets',['Ativos fixos líquidos','Net fixed assets','Activos fijos netos','Immobilisations nettes','Основные средства — нетто'],y=>b('fixedAssets',y)),
 line('current',['Ativo corrente','Current assets','Activo corriente','Actif courant','Оборотные активы'],y=>add(b('inventory',y),b('receivables',y),b('vatAsset',y),b('cash',y)),'subtotal'),
 line('inventory',['Inventários','Inventories','Existencias','Stocks','Запасы'],y=>b('inventory',y)),
 line('receivables',['Clientes','Customers','Clientes','Clients','Дебиторская задолженность'],y=>b('receivables',y)),
 line('vatAsset',['Estado e outros entes públicos — a recuperar','Tax receivables','Impuestos a recuperar','Créances fiscales','Налоги к возмещению'],y=>b('vatAsset',y)),
 line('cash',['Caixa e depósitos bancários','Cash and bank deposits','Caja y bancos','Trésorerie et dépôts bancaires','Денежные средства'],y=>b('cash',y)),
 line('assets',['TOTAL DO ATIVO','TOTAL ASSETS','TOTAL ACTIVO','TOTAL ACTIF','ИТОГО АКТИВЫ'],y=>b('assets',y),'total'),
 line('equity',['CAPITAL PRÓPRIO','EQUITY','PATRIMONIO NETO','CAPITAUX PROPRES','СОБСТВЕННЫЙ КАПИТАЛ'],y=>b('equity',y),'subtotal'),
 line('capital',['Capital e aportes dos sócios retidos','Retained contributed capital','Capital aportado retenido','Capital apporté conservé','Внесённый капитал'],y=>b('capital',y)),
 line('retained',['Resultados transitados e afetações','Retained earnings and appropriations','Resultados acumulados y aplicaciones','Report à nouveau et affectations','Накопленная прибыль и распределения'],y=>sub(b('retained',y),d('net',y))),
 line('net',['Resultado líquido do período','Net profit for the period','Resultado neto','Résultat net','Чистая прибыль'],y=>d('net',y)),
 line('liability',['PASSIVO','LIABILITIES','PASIVO','PASSIF','ОБЯЗАТЕЛЬСТВА'],undefined,'section'),
 line('long',['Passivo não corrente','Non-current liabilities','Pasivo no corriente','Passif non courant','Долгосрочные обязательства'],y=>add(b('longDebt',y),sub(b('taxPayable',y),b('currentTaxPayable',y))),'subtotal'),
 line('longDebt',['Financiamentos obtidos — médio e longo prazo','Long-term borrowings','Financiación a largo plazo','Emprunts à long terme','Долгосрочные займы'],y=>b('longDebt',y)),
 line('longTaxPayable',['Imposto sobre o rendimento a pagar — não corrente','Non-current income tax payable','Impuesto a pagar no corriente','Impôt à payer non courant','Долгосрочный налог к уплате'],y=>sub(b('taxPayable',y),b('currentTaxPayable',y))),
 line('short',['Passivo corrente','Current liabilities','Pasivo corriente','Passif courant','Краткосрочные обязательства'],y=>add(b('payables',y),b('vatPayable',y),b('currentTaxPayable',y),b('currentDebt',y)),'subtotal'),
 line('payables',['Fornecedores','Suppliers','Proveedores','Fournisseurs','Поставщики'],y=>b('payables',y)),
 line('vatPayable',['IVA a pagar','VAT payable','IVA a pagar','TVA à payer','НДС к уплате'],y=>b('vatPayable',y)),
 line('incomeTaxPayable',['Imposto sobre o rendimento a pagar — corrente','Current income tax payable','Impuesto a pagar corriente','Impôt à payer courant','Текущий налог к уплате'],y=>b('currentTaxPayable',y)),
 line('currentDebt',['Financiamentos obtidos — curto prazo','Short-term borrowings','Financiación a corto plazo','Emprunts à court terme','Краткосрочные займы'],y=>b('currentDebt',y)),
 line('liabilities',['TOTAL DO PASSIVO','TOTAL LIABILITIES','TOTAL PASIVO','TOTAL PASSIF','ИТОГО ОБЯЗАТЕЛЬСТВА'],y=>b('liabilities',y),'total'),
 line('equityLiabilities',['TOTAL DO CAPITAL PRÓPRIO E PASSIVO','TOTAL EQUITY AND LIABILITIES','TOTAL PATRIMONIO Y PASIVO','TOTAL CAPITAUX PROPRES ET PASSIF','ИТОГО КАПИТАЛ И ОБЯЗАТЕЛЬСТВА'],y=>add(b('equity',y),b('liabilities',y)),'total'),
 line('check',['Conferência: ativo − capital próprio − passivo','Check: assets − equity − liabilities','Control: activo − patrimonio − pasivo','Contrôle : actif − capitaux propres − passif','Проверка баланса'],y=>round(sub(b('assets',y),add(b('equity',y),b('liabilities',y)))),'check')
 ]},
 {id:'cash',title:['Mapa de tesouraria projetado','Projected treasury statement','Tesorería proyectada','Trésorerie prévisionnelle','Прогноз казначейства'] as Labels,lines:[
 line('operation',['FLUXOS DAS ATIVIDADES OPERACIONAIS','OPERATING CASH FLOWS','FLUJOS OPERATIVOS','FLUX OPÉRATIONNELS','ОПЕРАЦИОННЫЕ ПОТОКИ'],undefined,'section'),
 line('ebitda',['EBITDA','EBITDA','EBITDA','EBITDA','EBITDA'],y=>d('ebitda',y)),
 line('tax',['Imposto sobre o rendimento pago (−)','Income tax paid (−)','Impuesto pagado (−)','Impôt payé (−)','Уплаченный налог (−)'],y=>mul(-1,paidTax(y))),
 line('wc',['Investimento / variação do fundo de maneio (−)','Working capital investment / change (−)','Variación del circulante (−)','Variation du fonds de roulement (−)','Изменение оборотного капитала (−)'],y=>mul(-1,y===0?b('nwc',0):c('wcChange',y))),
 line('operating',['Cash flow operacional','Operating cash flow','Flujo operativo','Flux opérationnel','Операционный денежный поток'],op,'subtotal'),
 line('financing',['FLUXOS DAS ATIVIDADES DE FINANCIAMENTO','FINANCING CASH FLOWS','FLUJOS DE FINANCIACIÓN','FLUX DE FINANCEMENT','ФИНАНСОВЫЕ ПОТОКИ'],undefined,'section'),
 line('inflow',['Entradas de financiamento','Financing inflows','Entradas de financiación','Entrées de financement','Поступления финансирования'],y=>add(c('equityInjection',y),debt(y)),'subtotal'),
 line('equity',['Capital e aportes dos sócios','Shareholder contributions','Aportaciones de socios','Apports des associés','Взносы собственников'],y=>c('equityInjection',y)),
 line('debt',['Financiamentos obtidos','Borrowings received','Financiación obtenida','Emprunts reçus','Полученные займы'],debt),
 line('outflow',['Saídas de financiamento','Financing outflows','Salidas de financiación','Sorties de financement','Выплаты по финансированию'],y=>mul(-1,add(c('principal',y),c('interestPaid',y),c('financingFees',y),c('distribution',y))),'subtotal'),
 line('principal',['Amortização de dívida (−)','Debt principal repayments (−)','Amortización de deuda (−)','Remboursements d’emprunts (−)','Погашение долга (−)'],y=>mul(-1,c('principal',y))),
 line('interest',['Juros pagos (−)','Interest paid (−)','Intereses pagados (−)','Intérêts payés (−)','Уплаченные проценты (−)'],y=>mul(-1,c('interestPaid',y))),
 line('fees',['Comissões de financiamento (−)','Financing fees (−)','Comisiones (−)','Commissions (−)','Комиссии (−)'],y=>mul(-1,c('financingFees',y))),
 line('dividends',['Distribuições aos sócios (−)','Distributions to shareholders (−)','Distribuciones a socios (−)','Distributions aux associés (−)','Выплаты собственникам (−)'],y=>mul(-1,c('distribution',y))),
 line('financial',['Cash flow de financiamento','Financing cash flow','Flujo de financiación','Flux de financement','Финансовый денежный поток'],finance,'subtotal'),
 line('investment',['FLUXOS DAS ATIVIDADES DE INVESTIMENTO','INVESTING CASH FLOWS','FLUJOS DE INVERSIÓN','FLUX D’INVESTISSEMENT','ИНВЕСТИЦИОННЫЕ ПОТОКИ'],undefined,'section'),
 line('capex',['Aquisição de ativos fixos (−)','Purchase of fixed assets (−)','Adquisición de activos (−)','Acquisitions d’actifs (−)','Приобретение активов (−)'],y=>mul(-1,d('assetCost',y))),
 line('residual',['Alienação de ativos — valor residual líquido','Asset disposal — net residual proceeds','Enajenación — valor residual neto','Cessions — valeur résiduelle nette','Продажа активов — чистая остаточная стоимость'],terminal),
 line('investing',['Cash flow de investimento','Investing cash flow','Flujo de inversión','Flux d’investissement','Инвестиционный денежный поток'],invest,'subtotal'),
 line('opening',['Caixa no início do período','Opening cash','Caja inicial','Trésorerie initiale','Денежные средства на начало'],opening,'subtotal'),
 line('movement',['Variação de caixa no período','Net change in cash','Variación de caja','Variation de trésorerie','Изменение денежных средств'],movement,'subtotal'),
 line('closing',['CAIXA NO FINAL DO PERÍODO','CLOSING CASH','CAJA FINAL','TRÉSORERIE FINALE','ДЕНЕЖНЫЕ СРЕДСТВА НА КОНЕЦ'],y=>add(opening(y),movement(y)),'total'),
 line('check',['Conferência com o balanço','Reconciliation to balance sheet','Conciliación con el balance','Rapprochement au bilan','Сверка с балансом'],y=>round(sub(add(opening(y),movement(y)),b('cash',y))),'check')
 ]}
 ];
}
