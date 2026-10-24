import type {PlatformLocale} from './platform-i18n';
type Five=readonly [string,string,string,string,string];
const notes:Record<string,Five>={
 revenue:['Receitas reconhecidas no período. Compare com um período equivalente; crescimento de receita não garante crescimento do lucro.','Revenue recognised during the period. Compare equivalent periods; revenue growth does not guarantee profit growth.','Ingresos reconocidos en el período. Compare períodos equivalentes; crecer en ingresos no garantiza crecer en beneficio.','Produits reconnus sur la période. Comparez des périodes équivalentes ; leur hausse ne garantit pas celle du bénéfice.','Выручка за период. Сравнивайте сопоставимые периоды: рост выручки не гарантирует рост прибыли.'],
 costs:['Custos reconhecidos nos dados integrados. Leia a evolução em conjunto com as receitas e o volume de atividade.','Costs recognised in the integrated data. Read changes alongside revenue and activity volumes.','Costes reconocidos en los datos integrados. Lea la evolución junto con los ingresos y la actividad.','Charges reconnues dans les données intégrées. Analysez leur évolution avec les produits et l’activité.','Затраты из интегрированных данных. Оценивайте динамику вместе с выручкой и объёмом деятельности.'],
 recordedResult:['Receitas menos custos registados. É um resultado de gestão; a sua abrangência depende dos dados recebidos e não equivale necessariamente ao lucro contabilístico.','Recorded revenue less costs. This management result depends on source coverage and does not necessarily equal accounting profit.','Ingresos menos costes registrados. El resultado de gestión depende de la cobertura y no equivale necesariamente al beneficio contable.','Produits moins charges enregistrées. Ce résultat de gestion dépend de la couverture et ne correspond pas nécessairement au résultat comptable.','Выручка минус учтённые затраты. Управленческий результат зависит от полноты данных и может отличаться от бухгалтерской прибыли.'],
 ebitda:['Resultado antes de depreciações, juros e impostos. Ajuda a ler o desempenho operacional, mas não representa o dinheiro disponível no banco.','Earnings before depreciation, interest and tax. It describes operating performance, not cash available in the bank.','Resultado antes de depreciaciones, intereses e impuestos. Refleja el desempeño operativo, no el dinero disponible en el banco.','Résultat avant amortissements, intérêts et impôts. Il décrit la performance opérationnelle, pas la trésorerie disponible.','Результат до амортизации, процентов и налогов. Он отражает операционную деятельность, а не деньги на банковском счёте.'],
 net:['Resultado depois dos custos, encargos financeiros e impostos disponíveis. Lucro e geração de caixa podem evoluir de forma diferente.','Result after the available costs, finance charges and tax. Profit and cash generation can move differently.','Resultado después de los costes, gastos financieros e impuestos disponibles. Beneficio y caja pueden evolucionar de forma distinta.','Résultat après les charges, frais financiers et impôts disponibles. Bénéfice et trésorerie peuvent évoluer différemment.','Результат после доступных затрат, финансовых расходов и налогов. Прибыль и денежный поток могут изменяться по-разному.'],
 current:['Compara ativos correntes com dívidas de curto prazo. A qualidade dos stocks e a possibilidade de cobrar clientes também influenciam a liquidez real.','Compares current assets with short-term liabilities. Inventory quality and the collectability of receivables also affect actual liquidity.','Compara activos corrientes con deudas a corto plazo. La calidad del inventario y el cobro de clientes también afectan la liquidez real.','Compare les actifs courants aux dettes à court terme. La qualité des stocks et le recouvrement influencent aussi la liquidité réelle.','Сопоставляет оборотные активы с краткосрочными обязательствами. Учитывайте качество запасов и возможность взыскания дебиторской задолженности.'],
 headcount:['Colaboradores ativos no fim do período. O histórico de contratos deve estar completo para uma comparação fiável.','Active employees at period end. Complete contract history is needed for reliable comparisons.','Colaboradores activos al cierre. El historial contractual debe estar completo para una comparación fiable.','Effectif actif en fin de période. Un historique contractuel complet est nécessaire pour comparer correctement.','Сотрудники на конец периода. Для надёжного сравнения необходима полная история договоров.'],
 hires:['Entradas no período com base nos contratos. Leia juntamente com as saídas para perceber a evolução da equipa.','Period hires based on contracts. Read alongside exits to understand workforce changes.','Altas del período según contratos. Lea junto con las bajas para comprender la evolución de la plantilla.','Entrées sur la période selon les contrats. À lire avec les départs pour comprendre l’évolution de l’effectif.','Приём сотрудников за период по договорам. Рассматривайте вместе с увольнениями для понимания изменения численности.'],
 exits:['Saídas no período. Uma subida deve ser analisada por motivo e função; o número, isoladamente, não explica a retenção.','Exits during the period. Investigate roles and reasons; the count alone does not explain retention.','Bajas del período. Analice motivos y funciones; el número por sí solo no explica la retención.','Départs sur la période. Analysez les motifs et fonctions ; leur nombre seul n’explique pas la fidélisation.','Увольнения за период. Изучайте причины и должности: одно количество не объясняет удержание персонала.'],
 turnover:['Saídas divididas pelo efetivo médio do período, em percentagem. Compare períodos de duração equivalente.','Exits divided by average period headcount, expressed as a percentage. Compare periods of equivalent length.','Bajas divididas por la plantilla media del período, en porcentaje. Compare períodos de duración equivalente.','Départs divisés par l’effectif moyen, exprimés en pourcentage. Comparez des durées équivalentes.','Увольнения, делённые на среднюю численность, в процентах. Сравнивайте периоды одинаковой длительности.'],
 peopleCost:['Custo dos processamentos salariais incluídos no período e na moeda selecionados. Não presume pagamentos bancários nem custos externos ao payroll.','Cost of payroll runs included in the selected period and currency. It does not imply bank payments or costs outside payroll.','Coste de las nóminas incluidas en el período y moneda seleccionados. No presupone pagos bancarios ni costes ajenos a nómina.','Coût des paies incluses dans la période et devise choisies. Il ne présume ni règlements bancaires ni charges hors paie.','Стоимость расчётов зарплаты в выбранном периоде и валюте. Она не подтверждает банковские выплаты и не включает затраты вне payroll.'],
 costPerPaid:['Custo salarial dividido pelos colaboradores abrangidos pelo processamento. O denominador não é necessariamente o efetivo total da empresa.','Payroll cost divided by employees included in payroll. The denominator is not necessarily total company headcount.','Coste salarial dividido por colaboradores incluidos en nómina. El denominador no es necesariamente la plantilla total.','Coût salarial divisé par les salariés inclus dans la paie. Le dénominateur ne correspond pas nécessairement à l’effectif total.','Стоимость зарплаты на сотрудника, включённого в расчёт. Знаменатель может отличаться от общей численности компании.'],
 result:['Mostra uma dimensão do resultado do período. A fórmula abaixo identifica as rubricas utilizadas; compare períodos com a mesma cobertura.','Shows one dimension of period performance. The formula identifies the components; compare periods with equivalent coverage.','Muestra una dimensión del resultado. La fórmula identifica las partidas; compare períodos con igual cobertura.','Présente une dimension du résultat. La formule indique les postes ; comparez des périmètres équivalents.','Показывает одну из сторон результата. Формула указывает составляющие; сравнивайте периоды с одинаковым охватом.'],
 capital:['Relaciona os recursos e as obrigações do balanço. A escala não é uma classificação de risco nem uma meta automática.','Relates balance-sheet resources and obligations. The chart scale is neither a risk rating nor an automatic target.','Relaciona recursos y obligaciones del balance. La escala no es una calificación de riesgo ni una meta automática.','Met en relation ressources et obligations du bilan. L’échelle ne constitue ni une notation de risque ni un objectif automatique.','Сопоставляет ресурсы и обязательства баланса. Масштаб графика не является оценкой риска или автоматической целью.'],
 return:['Relaciona o resultado com os recursos utilizados. Observe na fórmula se o indicador é anualizado e quais os saldos médios usados.','Relates returns to resources used. Check the formula for annualisation and the average balances included.','Relaciona el resultado con los recursos utilizados. Consulte la fórmula para ver la anualización y los saldos medios.','Rapporte le résultat aux ressources utilisées. Vérifiez dans la formule l’annualisation et les soldes moyens retenus.','Сопоставляет результат с использованными ресурсами. Проверяйте в формуле годовое приведение и средние остатки.'],
 cash:['Ajuda a ler a liquidez e o ciclo de caixa. Considere os prazos de recebimento e pagamento; um valor maior nem sempre é mais favorável.','Helps explain liquidity and the cash cycle. Consider collection and payment terms; a higher value is not always better.','Ayuda a interpretar la liquidez y el ciclo de caja. Considere plazos de cobro y pago; un valor mayor no siempre es mejor.','Éclaire la liquidité et le cycle de trésorerie. Tenez compte des délais ; une valeur plus élevée n’est pas toujours préférable.','Помогает понять ликвидность и денежный цикл. Учитывайте сроки поступлений и платежей: больше не всегда лучше.'],
 value:['Depende dos resultados, do capital investido e dos pressupostos indicados na fórmula. Reveja a taxa de imposto e o custo de capital antes de concluir sobre criação de valor.','Depends on results, invested capital and assumptions in the formula. Review tax and capital-cost assumptions before assessing value creation.','Depende del resultado, capital invertido y supuestos de la fórmula. Revise impuestos y coste de capital antes de concluir sobre creación de valor.','Dépend du résultat, du capital investi et des hypothèses de la formule. Vérifiez impôt et coût du capital avant de conclure sur la création de valeur.','Зависит от результата, инвестированного капитала и предпосылок формулы. Проверьте налог и стоимость капитала перед выводами о создании стоимости.'],
};
const concepts:Record<string,Five>={
 "gross": [
  "Receitas depois do custo das mercadorias ou da produção vendida.",
  "Revenue after the cost of goods or production sold.",
  "Ingresos después del coste de mercancías o producción vendida.",
  "Produits après coût des marchandises ou de la production vendue.",
  "Выручка за вычетом себестоимости проданных товаров или продукции."
 ],
 "ebit": [
  "Resultado operacional depois da depreciação e antes de juros e impostos.",
  "Operating result after depreciation, before interest and tax.",
  "Resultado operativo después de depreciaciones, antes de intereses e impuestos.",
  "Résultat opérationnel après amortissements, avant intérêts et impôts.",
  "Операционный результат после амортизации, до процентов и налогов."
 ],
 "grossMargin": [
  "Percentagem das receitas que resta depois do custo das vendas.",
  "Share of revenue remaining after cost of sales.",
  "Porcentaje de ingresos restante después del coste de ventas.",
  "Part des produits restante après le coût des ventes.",
  "Доля выручки, остающаяся после себестоимости продаж."
 ],
 "ebitdaMargin": [
  "EBITDA gerado por cada 100 unidades monetárias de receitas.",
  "EBITDA generated per 100 currency units of revenue.",
  "EBITDA generado por cada 100 unidades monetarias de ingresos.",
  "EBITDA généré pour 100 unités monétaires de produits.",
  "EBITDA на каждые 100 денежных единиц выручки."
 ],
 "netMargin": [
  "Resultado líquido por cada 100 unidades monetárias de receitas.",
  "Net result per 100 currency units of revenue.",
  "Resultado neto por cada 100 unidades monetarias de ingresos.",
  "Résultat net pour 100 unités monétaires de produits.",
  "Чистый результат на каждые 100 денежных единиц выручки."
 ],
 "quick": [
  "Cobertura das dívidas de curto prazo pelos ativos correntes, excluindo stocks.",
  "Coverage of short-term liabilities by current assets excluding inventory.",
  "Cobertura de deudas a corto plazo por activos corrientes sin existencias.",
  "Couverture des dettes à court terme par les actifs courants hors stocks.",
  "Покрытие краткосрочных обязательств оборотными активами без запасов."
 ],
 "cashRatio": [
  "Caixa disponível por cada unidade monetária de passivo corrente.",
  "Cash available per currency unit of current liabilities.",
  "Caja disponible por unidad monetaria de pasivo corriente.",
  "Trésorerie disponible par unité monétaire de passif courant.",
  "Денежные средства на единицу краткосрочных обязательств."
 ],
 "autonomy": [
  "Percentagem dos ativos financiada por capital próprio.",
  "Percentage of assets financed by equity.",
  "Porcentaje de activos financiado con patrimonio neto.",
  "Pourcentage des actifs financé par les capitaux propres.",
  "Доля активов, финансируемая собственным капиталом."
 ],
 "leverage": [
  "Passivo por cada unidade monetária de capital próprio.",
  "Liabilities per currency unit of equity.",
  "Pasivo por unidad monetaria de patrimonio neto.",
  "Passif par unité monétaire de capitaux propres.",
  "Обязательства на единицу собственного капитала."
 ],
 "solvency": [
  "Capital próprio por cada unidade monetária de passivo.",
  "Equity per currency unit of liabilities.",
  "Patrimonio neto por unidad monetaria de pasivo.",
  "Capitaux propres par unité monétaire de passif.",
  "Собственный капитал на единицу обязательств."
 ],
 "debtAssets": [
  "Percentagem dos ativos suportada por passivos.",
  "Percentage of assets supported by liabilities.",
  "Porcentaje de activos financiado por pasivos.",
  "Pourcentage des actifs financé par le passif.",
  "Доля активов, финансируемая обязательствами."
 ],
 "longWeight": [
  "Peso das obrigações de longo prazo no total dos ativos.",
  "Long-term liabilities as a share of total assets.",
  "Peso de las obligaciones a largo plazo en el total de activos.",
  "Poids des engagements à long terme dans le total des actifs.",
  "Доля долгосрочных обязательств в общей сумме активов."
 ],
 "netDebt": [
  "Dívida financeira menos caixa. Um valor negativo significa que o caixa supera essa dívida.",
  "Financial debt less cash. A negative value means cash exceeds that debt.",
  "Deuda financiera menos caja. Un valor negativo significa que la caja supera esa deuda.",
  "Dette financière moins trésorerie. Une valeur négative signifie que la trésorerie dépasse cette dette.",
  "Финансовый долг за вычетом денежных средств. Отрицательное значение означает превышение денег над этим долгом."
 ],
 "netDebtEbitda": [
  "Dívida líquida dividida pelo EBITDA anualizado; não é um prazo contratual de reembolso.",
  "Net debt divided by annualised EBITDA; this is not a contractual repayment term.",
  "Deuda neta dividida por EBITDA anualizado; no es un plazo contractual de devolución.",
  "Dette nette divisée par EBITDA annualisé ; ce n’est pas une durée contractuelle de remboursement.",
  "Чистый долг, делённый на годовой EBITDA; это не договорный срок погашения."
 ],
 "interestCover": [
  "Quantas vezes o resultado operacional cobre os juros do período; não mede pagamentos efetivos.",
  "How many times operating profit covers period interest; it does not measure actual payments.",
  "Veces que el resultado operativo cubre los intereses; no mide pagos efectivos.",
  "Nombre de fois où le résultat opérationnel couvre les intérêts ; ne mesure pas les paiements réels.",
  "Во сколько раз операционная прибыль покрывает проценты за период; фактические платежи не измеряются."
 ],
 "roe": [
  "Retorno anualizado do resultado líquido sobre o capital próprio médio.",
  "Annualised net return on average equity.",
  "Rentabilidad neta anualizada sobre el patrimonio medio.",
  "Rentabilité nette annualisée des capitaux propres moyens.",
  "Годовая доходность чистого результата на средний собственный капитал."
 ],
 "roa": [
  "Retorno anualizado do resultado líquido sobre os ativos médios.",
  "Annualised net return on average assets.",
  "Rentabilidad neta anualizada sobre los activos medios.",
  "Rentabilité nette annualisée des actifs moyens.",
  "Годовая доходность чистого результата на средние активы."
 ],
 "assetTurnover": [
  "Receitas anualizadas geradas por cada unidade monetária de ativos médios.",
  "Annualised revenue generated per currency unit of average assets.",
  "Ingresos anualizados por unidad monetaria de activos medios.",
  "Produits annualisés générés par unité monétaire d’actifs moyens.",
  "Годовая выручка на единицу средних активов."
 ],
 "equityMultiplier": [
  "Ativos médios por cada unidade monetária de capital próprio médio.",
  "Average assets per currency unit of average equity.",
  "Activos medios por unidad monetaria de patrimonio medio.",
  "Actifs moyens par unité monétaire de capitaux propres moyens.",
  "Средние активы на единицу среднего собственного капитала."
 ],
 "invested": [
  "Média do capital próprio mais dívida financeira menos caixa, segundo a base do modelo.",
  "Average equity plus financial debt less cash, on the model’s basis.",
  "Promedio del patrimonio más deuda financiera menos caja, según la base del modelo.",
  "Moyenne des capitaux propres plus dette financière moins trésorerie, selon le modèle.",
  "Средний собственный капитал плюс финансовый долг минус денежные средства по базе модели."
 ],
 "nopat": [
  "Resultado operacional depois do imposto estimado, antes do efeito do financiamento.",
  "Operating profit after assumed tax, before financing effects.",
  "Resultado operativo después del impuesto estimado, antes del efecto financiero.",
  "Résultat opérationnel après impôt estimé, avant effet du financement.",
  "Операционный результат после расчётного налога, до влияния финансирования."
 ],
 "roic": [
  "Retorno operacional anualizado depois de imposto sobre o capital investido médio.",
  "Annualised after-tax operating return on average invested capital.",
  "Rentabilidad operativa anualizada después de impuestos sobre el capital invertido medio.",
  "Rentabilité opérationnelle annualisée après impôt sur le capital investi moyen.",
  "Годовая операционная доходность после налогов на средний инвестированный капитал."
 ],
 "working": [
  "Ativos correntes menos passivos correntes. Um saldo positivo não equivale a dinheiro disponível.",
  "Current assets less current liabilities. A positive balance is not the same as cash available.",
  "Activos corrientes menos pasivos corrientes. Un saldo positivo no equivale a caja disponible.",
  "Actifs courants moins passifs courants. Un solde positif n’équivaut pas à de la trésorerie disponible.",
  "Оборотные активы минус краткосрочные обязательства. Положительный остаток не равен доступным деньгам."
 ],
 "dso": [
  "Dias estimados de receitas representados pelo saldo final de clientes.",
  "Estimated revenue days represented by closing receivables.",
  "Días estimados de ingresos representados por el saldo final de clientes.",
  "Jours estimés de produits représentés par les créances clients finales.",
  "Расчётные дни выручки, представленные конечной дебиторской задолженностью."
 ],
 "dio": [
  "Dias estimados de custo das vendas representados pelos stocks finais.",
  "Estimated cost-of-sales days represented by closing inventory.",
  "Días estimados de coste de ventas representados por las existencias finales.",
  "Jours estimés de coût des ventes représentés par les stocks finaux.",
  "Расчётные дни себестоимости продаж, представленные конечными запасами."
 ],
 "dpo": [
  "Dias estimados de pagamentos usando fornecedores e custo das vendas como aproximação.",
  "Estimated payment days using trade payables and cost of sales as a proxy.",
  "Días estimados de pago usando proveedores y coste de ventas como aproximación.",
  "Jours estimés de paiement utilisant fournisseurs et coût des ventes comme approximation.",
  "Расчётные дни оплаты на основе задолженности поставщикам и себестоимости продаж как приближения."
 ],
 "cycle": [
  "Dias de clientes mais dias de stocks, menos dias de fornecedores.",
  "Receivable days plus inventory days, less payable days.",
  "Días de clientes más días de existencias, menos días de proveedores.",
  "Jours clients plus jours de stocks, moins jours fournisseurs.",
  "Дни дебиторской задолженности плюс дни запасов минус дни кредиторской задолженности."
 ],
 "operating": [
  "Recebimentos menos pagamentos classificados como operacionais na fonte.",
  "Receipts less payments classified as operating in the source.",
  "Cobros menos pagos clasificados como operativos en la fuente.",
  "Encaissements moins décaissements classés comme opérationnels dans la source.",
  "Поступления минус выплаты, классифицированные источником как операционные."
 ],
 "investing": [
  "Entradas menos saídas de caixa classificadas como investimento.",
  "Cash inflows less outflows classified as investing.",
  "Entradas menos salidas de caja clasificadas como inversión.",
  "Entrées moins sorties de trésorerie classées en investissement.",
  "Денежные поступления минус выплаты, классифицированные как инвестиционные."
 ],
 "financing": [
  "Entradas menos saídas de caixa classificadas como financiamento.",
  "Cash inflows less outflows classified as financing.",
  "Entradas menos salidas de caja clasificadas como financiación.",
  "Entrées moins sorties de trésorerie classées en financement.",
  "Денежные поступления минус выплаты, классифицированные как финансовые."
 ],
 "freeCash": [
  "Soma dos fluxos operacional e de investimento, mantendo a classificação de juros da fonte.",
  "Sum of operating and investing cash flows, retaining the source interest classification.",
  "Suma del flujo operativo y de inversión, conservando la clasificación de intereses de la fuente.",
  "Somme des flux opérationnels et d’investissement, en conservant le classement des intérêts de la source.",
  "Сумма операционного и инвестиционного потоков с сохранением классификации процентов источника."
 ],
 "conversion": [
  "Caixa operacional como percentagem do EBITDA; mostra quanto resultado operacional se converteu em caixa.",
  "Operating cash as a percentage of EBITDA; indicates conversion into cash.",
  "Caja operativa como porcentaje del EBITDA; muestra la conversión en efectivo.",
  "Trésorerie opérationnelle en pourcentage de l’EBITDA ; indique la conversion en trésorerie.",
  "Операционный денежный поток в процентах от EBITDA; показывает преобразование результата в деньги."
 ],
 "capitalCharge": [
  "Custo estimado do capital investido para a duração do período, usando o WACC indicado.",
  "Estimated invested-capital cost over the period using the specified WACC.",
  "Coste estimado del capital invertido para la duración del período usando el WACC indicado.",
  "Coût estimé du capital investi sur la période selon le WACC indiqué.",
  "Расчётная стоимость инвестированного капитала за период с использованием указанного WACC."
 ],
 "eva": [
  "Resultado operacional depois de imposto menos o encargo estimado do capital do período.",
  "After-tax operating profit less the estimated period capital charge.",
  "Resultado operativo después de impuestos menos el cargo estimado del capital del período.",
  "Résultat opérationnel après impôt moins charge estimée du capital sur la période.",
  "Операционный результат после налогов минус расчётная плата за капитал за период."
 ],
 "spread": [
  "ROIC anual menos WACC anual, em pontos percentuais. Positivo significa retorno acima do custo de capital assumido.",
  "Annual ROIC less annual WACC, in percentage points. Positive means return exceeds assumed capital cost.",
  "ROIC anual menos WACC anual, en puntos porcentuales. Positivo significa retorno superior al coste de capital supuesto.",
  "ROIC annuel moins WACC annuel, en points. Positif signifie rendement supérieur au coût du capital retenu.",
  "Годовой ROIC минус годовой WACC в процентных пунктах. Плюс означает доходность выше принятой стоимости капитала."
 ],
 "valueAdded": [
  "Produção reconhecida menos consumos intermédios, segundo as rubricas disponíveis na fonte.",
  "Recognised output less intermediate consumption, using available source categories.",
  "Producción reconocida menos consumos intermedios, según las partidas disponibles.",
  "Production reconnue moins consommations intermédiaires selon les postes disponibles.",
  "Признанная продукция минус промежуточное потребление по доступным статьям источника."
 ],
 "valueAddedPerson": [
  "Valor acrescentado dividido pelo efetivo médio contratado disponível para o período.",
  "Value added divided by available average contracted headcount for the period.",
  "Valor añadido dividido por la plantilla media contratada disponible del período.",
  "Valeur ajoutée divisée par l’effectif contractuel moyen disponible de la période.",
  "Добавленная стоимость, делённая на доступную среднюю договорную численность за период."
 ]
};
export function kpiVisualNote(key:string,locale:PlatformLocale,group='result'){
 const index={pt:0,en:1,es:2,fr:3,ru:4}[locale];
 return notes[key]?.[index]||(concepts[key]?concepts[key][index]+' '+(notes[group]||notes.result)[index]:(notes[group]||notes.result)[index]);
}
