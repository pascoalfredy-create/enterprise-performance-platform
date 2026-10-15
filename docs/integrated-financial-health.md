# Motor financeiro integrado e indicadores de pessoas

## Objetivo e fontes

O Cockpit CFO, Demonstrações e Working Capital abrem a área Saúde financeira e mapas. Os mapas novos são calculados a partir de uma fonte por empresa e moeda: saldos de abertura validados e movimentos económicos integrados. Nenhum saldo ou vencimento é deduzido por suposição. O motor gera internamente movimentos equilibrados; o gestor não precisa de introduzir débitos e créditos.

As áreas Performance/Desvios continuam a consultar Actual/Budget existentes. Os novos movimentos de resultado também geram Actual, e a ligação a um Actual anterior reutiliza o registo sem repetir o montante. A qualidade dos mapas é sinalizada como incompleta enquanto existirem receitas/custos anteriores à data de posição sem ligação, períodos não cobertos ou saldos inválidos.

A API de demonstrações e o cálculo do diagnóstico passam a preferir esta fonte quando configurada. O diagnóstico exige integração completa e recusa pontuar indicadores com denominador nulo ou não positivo; as regras e pesos continuam configuráveis. Não é criado um rating universal de saúde financeira.

## Ativar com dados reais

1. Selecionar empresa, moeda e período em Finanças.
2. Abrir Saldos iniciais. Informar a posição imediatamente anterior ao primeiro movimento, referência de suporte e data. Ativo deve ser igual a Passivo + Capital próprio. Depreciação acumulada é deduzida dos ativos fixos; resultados anteriores podem ser negativos. Caixa negativa deve ser analisada e representada pelo financiamento adequado, não como ativo negativo.
3. Clientes, fornecedores e impostos de abertura podem ser globais. Esses saldos aparecem no mapa de documentos como abertura sem detalhe de vencimento: não se inventa antiguidade de dívida. Liquidações podem abater esses saldos.
4. Em Integrar dados existentes, escolher o tratamento financeiro e a data de cada receita/custo Actual. Pode ser venda recebida/a prazo, despesa paga/a pagar, consumo ou depreciação. Valores negativos podem ser regularizações líquidas com caixa ou contra documento em aberto. O tratamento deve corresponder ao acontecimento real. Registos já ligados não podem ser integrados novamente.
5. Registar novos movimentos e usar as áreas Contas a receber, Contas a pagar e Impostos para liquidar total ou parcialmente. Selecionar o período do recebimento/pagamento realizado.
6. Registar os saldos de tesouraria da data de posição para a reconciliação externa da caixa. A reconciliação só é indicada quando todas as contas da empresa/moeda têm saldo válido nessa data.

A abertura só pode ser alterada sem movimentos ativos. Não usar o campo de capital como diferença automática de fecho: os saldos têm de estar suportados.

## Tratamentos suportados

- Venda a prazo: cliente a receber e receita; recebimento posterior liquida o cliente sem repetir receita.
- Despesa a prazo: gasto e fornecedor a pagar; pagamento posterior liquida o fornecedor sem repetir gasto.
- Compra de inventário: ativo até ao consumo/custo das vendas.
- Compra de equipamento: ativo fixo; depreciação afeta o resultado em movimento próprio e não afeta caixa.
- Empréstimos e entradas de capital: financiamento, sem receita. Reembolso de principal não é gasto; juros são registados separadamente como gasto financeiro.
- Imposto cobrado na venda: dívida fiscal separada da receita. Imposto recuperável na compra: ativo separado do gasto. Só usar quando o direito à recuperação estiver confirmado.
- Despesa fiscal a pagar: gasto fiscal e dívida fiscal. Uma retenção sobre fornecedor/payroll já reconhecido transfere parte da conta a pagar para impostos sem duplicar gasto.
- Compensação de imposto recuperável e recebimento de reembolso fiscal têm movimentos próprios. A validade jurídica/fiscal da compensação não é decidida pela plataforma.
- Regularizações líquidas de receita/custo permitem devolução/recuperação em caixa ou abatimento de documento em aberto. Não alteram impostos automaticamente; não equivalem à emissão de uma nota de crédito fiscal completa.

Os montantes fiscais e vencimentos são manuais. Não há liquidação automática de impostos, declarações, submissão fiscal ou aplicação de taxas legais neste motor. Não se efetuam pagamentos bancários.

## Mapas e análise

- DRE: receita, custo das vendas, margem bruta, gastos operacionais, EBITDA, depreciação, resultado operacional, gastos financeiros, resultado antes de impostos, imposto e resultado líquido.
- Balanço: ativos correntes/não correntes, passivos correntes/não correntes e capital próprio. Resultados acumulados desde a abertura são incorporados no capital próprio sem repetir o resultado.
- Fluxo de caixa direto: recebimentos/pagamentos operacionais, de investimento e de financiamento; caixa inicial, variação e caixa final. Movimentos sem caixa são excluídos. A atividade do fluxo é explicitamente selecionada para refletir a política aplicável.
- Base mensal ou acumulada do ano, com comparativo escolhido pelo utilizador. Se a abertura não cobrir todo o intervalo, a falta de cobertura é mostrada. Nenhum período anterior é preenchido como se existissem dados completos.
- AH: (atual − comparativo) / valor absoluto do comparativo; base zero ou comparativo sem cobertura produz percentagem indisponível.
- AV da DRE: rubrica / receitas; despesas são apresentadas com sinal de subtração. AV do balanço: rubrica / Ativo. AV dos fluxos: movimento / recebimentos totais; caixa inicial/final não são movimentos.
- Liquidez corrente e reduzida, fundo de maneio, passivo/ativo, capital próprio/ativo e margem líquida. Denominadores não positivos não produzem rácios.

Os alertas são factuais: recebíveis vencidos, pagamentos/impostos vencidos, resultado negativo, fundo de maneio negativo, dados sem ligação e diferença de caixa. Não há inferência de saúde completa apenas por existir lucro. Os valores são de gestão por empresa/moeda; não há conversão cambial automática ou consolidação implícita entre empresas. Exportação Excel conserva valores dos mapas, comparativos, documentos e evidências de cobertura, sem fórmulas de edição externa.

## Pessoas

RH abre Indicadores de gestão: efetivo, admissões, saídas, rotatividade, payroll fechado (bruto + encargos patronais), custo médio por pessoa processada, vagas, contratos a terminar, horas aprovadas e avaliações finalizadas. Empresa, mês e moeda são filtros reais.

Rotatividade = saídas / média do efetivo inicial e final. Renovações contratuais contínuas não são saídas e admissões. A taxa fica indisponível sem histórico contratual utilizável ou denominador. O custo médio usa pessoas efetivamente processadas. A diferença entre horas planeadas e trabalhadas usa apenas folhas aprovadas e pode incluir férias/ausências autorizadas: não é uma taxa legal de absentismo injustificado.

A distribuição atual por empresa e as vagas usam o estado atual. O efetivo histórico é reconstruído por contratos e pela empresa atualmente atribuída ao colaborador; não existe reconstrução completa de transferências históricas entre empresas. A interface explicita esta limitação.

No cockpit financeiro, payroll fechado é um indicador separado, com custo/receitas quando há base comparável. Não é somado automaticamente à DRE: é necessário integrar o respetivo lançamento financeiro para evitar duplicações. Os cabeçalhos de payroll dos painéis anteriores foram corrigidos para respeitar o âmbito da empresa.

## Correção, acesso e validação

Movimentos publicados são imutáveis e podem ser anulados com motivo e registo de auditoria. É necessário anular primeiro liquidações/dependências. Os mapas são recalculados; a anulação é uma correção/restatement de gestão, não uma nova operação estatutária de um período fechado. Não há fecho contabilístico certificado neste módulo.

Controlos: âmbito de tenant/empresa, perfis de escrita, referências únicas, ligação única a Actual, proteção de pagamentos excessivos também na base de dados, saldos não negativos nos controlos, abertura equilibrada, histórico de correções e rollback transacional se falhar a auditoria.

Validação local: produção/build, typecheck e 297 testes, incluindo 18 novos percursos de motor financeiro/pessoas. Inclui venda/recebimento, compras/pagamento parcial, impostos/compensações/retenções, inventários/depreciação, regularizações negativas, comparação mensal/acumulada, reconciliação externa e proteção de dados por empresa. A validação visual autenticada em produção fica por realizar.

## Limites e evolução

Esta entrega é um motor de gestão e demonstrações por empresa/moeda. Não é uma certificação contabilística/fiscal, uma integração bancária executora, uma consolidação cambial ou uma promessa de liderança de mercado. A qualidade da análise depende de saldos suportados, integração e classificação corretas. Funcionalidades fiscais específicas, notas de crédito fiscais, fechos estatutários, transferências históricas completas de pessoal e parametrizações nacionais exigem trabalhos próprios e validação do respetivo domínio.

Os controlos temporais rejeitam consultas anteriores à abertura e movimentos que gerariam saldos negativos em datas anteriores, mesmo que uma entrada posterior os cobrisse no fim do mês. Valores Actual integrados não podem mudar silenciosamente de montante, período, moeda ou natureza; é necessário corrigir o movimento financeiro. Categorias analíticas e descrições permanecem editáveis sem alterar os números.

## Single-entry workflow and treasury navigation

Statements are calculated views, never manually entered totals. Register a financial operation once: a credit sale creates revenue and a receivable; a credit expense creates the expense and a payable. Settlement changes cash and the outstanding document without recognising income a second time. Opening balances are a one-time source setup, not a monthly statement-entry exercise.

Receivables, payables, taxes, realised transactions and legacy-source linking now live under Treasury → Receivables, payables and taxes. CFO and Statements contain the health and statement views; their outstanding-item alerts take the user to the appropriate Treasury section. Treasury → Position and forecast retains bank balances and the existing manual forecast. This change does not automatically convert legacy Actual entries or manual forecasts into settled transactions: a revenue/cost amount alone does not establish the cash settlement date, the counterparty or opening positions.
