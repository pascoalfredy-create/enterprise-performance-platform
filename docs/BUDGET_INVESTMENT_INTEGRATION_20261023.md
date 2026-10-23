# Orçamento — investimentos, depreciação e caixa

## Fonte e limites

O adaptador lê exclusivamente `financial_models` aprovados, as suas linhas e as projeções mensais persistidas. Não recalcula nem altera o plano de negócio, as fórmulas de viabilidade, os salários ou os documentos importados. A organização, moeda, período e sinal vêm da origem. Não existe conversão cambial implícita nem distribuição fictícia por departamentos.

| Finalidade escolhida | Origem permitida | Valor / período | Destino |
|---|---|---|---|
| Investimento por competência | `CAPEX` | `statement_amount_minor` / `period` | Rubrica analítica Ativo / Investimento, no mapa económico |
| Depreciação mensal | `Custo`, com confirmação explícita de que representa depreciação | `statement_amount_minor` / `period` | Rubrica analítica de Custo, no mapa económico |
| Pagamento do investimento | `CAPEX` | `cash_amount_minor` / `cash_period` | Rubrica Caixa / Investimento, em contribuições financeiras separadas |
| Entrada ou reembolso de financiamento | `Financiamento` | `cash_amount_minor` / `cash_period` | Rubrica Caixa / Financiamento, em contribuições financeiras separadas |

Sem uma linha mensal aprovada que represente depreciações, não se calcula depreciação a partir de CAPEX. A fonte atual não guarda vida útil, valor residual ou data de entrada em utilização. O utilizador identifica o significado da linha de Custo; os montantes continuam a ser os aprovados na fonte. Não se presume que todo Custo é depreciação.

## Integração e evidência

O novo `/api/investment-budget` usa a mesma autorização de orçamento e o mesmo módulo financeiro. Valida âmbito da empresa em todos os acessos e ids de ligação. A configuração escolhe origem, finalidade, rubrica, dimensão e políticas. Uma projeção completa só pode alimentar um destino ativo por finalidade, incluindo entre dimensões; não é um mecanismo de repartição de custos.

As leituras da fonte geram movimentos idempotentes no motor comum. A competência usa a aplicação económica já existente, com os mesmos ajustes e bloqueios manuais. A natureza financeira é aplicada apenas em `budget_integration_values`, sem inserir `performance_entries`, sem contaminar receitas/custos e sem fabricar saldo de caixa. A migração 0085 reforça a unicidade da origem ativa na base, preservando os contratos dos adaptadores RH e genéricos.

O exercício de destino limita os meses aplicados. Pagamentos que ultrapassem dezembro permanecem na origem e aparecem como aviso; podem ser aplicados num orçamento do exercício seguinte. Não são antecipados nem descartados. A tabela de caixa apresenta apenas movimentos aplicados, separada da competência. Não representa tesouraria completa: faltam as outras origens e o saldo inicial.

Cada contribuição financeira conserva os movimentos e a rubrica de destino. Os mesmos controlos de imutabilidade de versões aprovadas impedem a reescrita. A consulta aprovada usa a estrutura congelada e a evidência aplicada, sem depender das ligações ativas atuais. Substituição ou retirada reconcilia apenas o rascunho indicado. Uma ligação retirada é recuperável.

## Interface

O mapa anual e o seu Excel permanecem económicos. A secção expansível «Investimentos e caixa previstos» acrescenta configuração contextual, aplicação, retirada/reativação, leitura de movimentos financeiros, origem e Excel próprio de caixa. Os movimentos sem contribuição não enchem a tabela. Versões aprovadas não oferecem ações de alteração.

## Validação

Testes específicos com todas as migrações reais cobrem competência vs. pagamento diferido, mudança de exercício, idempotência, financiamento negativo, confirmação da semântica de depreciação, isolamento de tenant/empresa, categorias incompatíveis, duplicação concorrente, retirada/reativação e congelamento histórico.

QA local usa o componente React real com os handlers e SQLite para selecionar a origem, aplicar caixa sem lançar custos, consultar evidência, apresentar erro real da API, retirar/reativar e consultar uma versão aprovada. CI final, comparação no navegador e publicação devem ser verificados no PR correspondente antes de declarar a entrega publicada.

## Continuação

O adaptador não converte os estudos anuais de viabilidade em meses artificiais. Uma futura fonte de ativos com vidas úteis/calendários explícitos poderá gerar depreciação própria. A tesouraria previsional completa deverá juntar outras origens financeiras e saldo inicial, preservando a separação entre resultado, posição patrimonial e caixa implementada aqui.
