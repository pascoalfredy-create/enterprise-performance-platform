# Gestão financeira e viabilidade

## Saldo bancário
Em Tesouraria, escolher a data dos saldos. Cada conta com saldo tem Corrigir e Apagar. Corrigir altera o valor e a referência; Apagar retira o saldo dessa data e exige novo saldo para projetar. Não recupera automaticamente um extrato antigo. Revisões guardam autor, data e valores anteriores.

## Rentabilidade
Receitas e custos realizados vêm de performance_entries Actual sem versão orçamental: importações publicadas, dados existentes e registos de Gestão manual. A área Receitas e custos reúne valores manuais e Actual existentes no período/moeda selecionados, com origem identificada. Permite adicionar, corrigir e apagar registos manuais. Tipo (Receita/Custo), categoria de gestão e descrição são campos independentes; categorias são livres, reutilizáveis e podem ser alteradas. Não editar importações por este formulário. Evitar duplicar importações. As previsões de tesouraria e os saldos não alimentam a margem. Custos manuais são valores positivos.

## Viabilidade
O novo estudo permite guardar premissas por organização/moeda e reabrir a revisão para editar. Os casos anteriores continuam disponíveis em Casos anteriores. Modelo anual nominal do projeto antes de financiamento, horizonte 1–30 anos. Projeta volume/preço, custos variáveis/fixos e crescimentos, depreciação linear até ao residual, imposto sobre EBIT positivo, fundo de maneio por prazos médios e recuperação final. Calcula fluxo livre, VAL incluindo ano zero, TIR somente para fluxo convencional com raiz no intervalo suportado, payback simples/descontado com interpolação e ponto de equilíbrio operacional do primeiro ano. Cenários mudam apenas o volume ±20%. Exportação Excel contém valores calculados e premissas; não contém fórmulas editáveis.

Taxas são anuais e nominais. Sem financiamento, IVA, reinvestimentos, compensação de prejuízos fiscais ou perpetuidade. Residual é líquido de impostos/custos de alienação. Prazos de fundo de maneio usam 365 dias e custos variáveis como aproximação das compras. A análise é uma estimativa gerencial, independente dos realizados.


## Leitura para gestores
Quatro indicadores: receitas, custos, resultado e margem sobre receitas. Gráfico por categoria mostra composição de cada tipo (denominadores separados). Clicar numa categoria abre os registos que sustentam o valor. A pesquisa e os filtros alteram a lista; os indicadores continuam a representar todo o período selecionado. Exportação separa lista filtrada e resumo completo. Não se conclui saúde financeira com base apenas no resultado. Rubricas sem classificação bloqueiam resultado e margem.

A classificação financeira avançada permanece acessível em Configuração financeira, mesmo depois de uma rubrica sair dos pendentes ou ser movida para Ativo/Outro. A alteração é partilhada por todos os relatórios do tenant e exige o perfil autorizado. Valores internos das opções são independentes das traduções.

Critério de evolução do produto: dado → explicação verificável → impacto → ação. Recomendações devem apontar os registos, período e moeda que as sustentam e distinguir realizado, projeção e dados em falta. Esta entrega cobre receitas/custos e reclassificação; não adiciona diagnóstico completo de liquidez, dívida ou gestão de pessoas.

## Motor integrado
A fonte de Saúde financeira, DRE, balanço e fluxo de caixa foi implementada no motor financeiro. Ver `docs/integrated-financial-health.md` para ativação, fórmulas, reconciliação, indicadores de pessoas e limites. Os saldos de abertura e os Actual anteriores exigem informação e ligação explícitas; não são presumidos.
