# Orçamento universal — auditoria e ponto de continuação

Data: 23/10/2026 (Luanda). Código auditado: `main`, commit `75fa8c074b17b74e9049aac2799ffde02f19fa82`.

## Conclusão

O ponto de continuação é a homologação e correção da integração RH → Orçamento (Fase 3.2), antes de implementar a integração de Investimentos/CAPEX (Fase 3.3). O mapa anual e o adaptador RH já existem. Não devem ser reconstruídos nem substituídos por outro orçamento.

Foram recuperados trechos da conversa «Montar mapa orçamental universal» e lidos integralmente os documentos `Texto colado(2).txt` (relatório da Fase 3.1) e `Texto colado(3).txt` (diagnóstico anterior da Fase 3.2). O diagnóstico é anterior à implementação e contém propostas posteriormente substituídas. A pesquisa de conversa não equivale a recuperar uma transcrição integral; o estado implementado foi confirmado no código e histórico git.

Nesta auditoria não se alteraram código funcional, dados de produção, migrações, permissões ou fórmulas. Não foi feita nova homologação visual nesta etapa. Os testes e cenários adicionais correram apenas em SQLite local, com dados sintéticos.

## Onde o outro agente parou

| Etapa | Evidência confirmada | Estado |
|---|---|---|
| Mapa anual e pressupostos | `worker/budget-annual-map.ts`, `lib/budget-drivers.ts`, `app/budget-annual-map-workspace.tsx`, migração 0079 | Implementados: 12 meses, versões, dimensões, pressupostos combináveis, importação/exportação Excel. |
| Proteção de versões aprovadas | Commit `dd07fe9`, migração 0080, snapshots de rubricas e triggers | Implementada: valores e hierarquia aprovados congelados. |
| Fase 3.1 — motor comum | Commit `2f47a71`, `worker/budget-integration.ts`, migração 0081 | Implementada: movimentos individuais, agregados por versão, políticas de relação/sincronização, ajustes e origem. |
| Fase 3.2 — RH | Commit `e8f7e23`, `worker/workforce-budget-integration.ts`, migração 0082 e painel no mapa | Implementada. O diagnóstico antigo que dizia «sem adaptador/UI» já não descreve a main. |
| Correções posteriores | PR #38 / commits `153752c`, `c025f29`, migração 0083 | Autorização por empresa, moeda/dimensão, composição de fontes e evidência congelada foram reforçadas. |
| Apresentação e duplicações | PRs #40 e #41 | Preservar o layout aprovado, cinco áreas financeiras e localização única do plano mensal. |
| Fase 3.3 — Investimentos/CAPEX | Trecho recuperado autoriza diagnóstico; não foi encontrado adaptador operacional no código | Pendente. A conversa exige separar investimento, depreciação, pagamento e financiamento. |

### Decisões finais que prevalecem sobre o diagnóstico antigo

- O utilizador escolhe explicitamente o plano RH e a sua versão aprovada. Não selecionar automaticamente a mais recente.
- A correspondência de um código de departamento com dimensão financeira exige decisão humana; um código desconhecido fica pendente. Não usar correspondência automática nem transformar desconhecidos em «sem dimensão».
- O custo planeado é `headcount × monthly_cost_minor`. Não inventar a repartição entre salário, subsídios e encargos quando a origem só fornece um custo agregado.
- O processamento salarial realizado e o plano RH orçamentado continuam separados.
- Uma versão aprovada não muda quando a origem ou o mapeamento atual muda.
- «Automática» significa elegibilidade na próxima aplicação explícita. Não existe scheduler/webhook para esta integração.
- Os valores económicos pertencem ao orçamento; os valores financeiros não devem ser aplicados à mesma célula económica.

## Achados reproduzidos

Os valores abaixo são **unidades mínimas sintéticas**, não montantes de clientes. «Esperado» indica o comportamento necessário para respeitar as proteções e reconciliação descritas na arquitetura.

| ID / prioridade | Reprodução e resultado | Local e consequência |
|---|---|---|
| B01 / Alta | Reatribuir FIN da dimensão Financeiro para Comercial, sincronizar e aplicar: custo esperado 200; total passa a 400, 200 em cada dimensão. | `ensureDepartmentMappings` / `syncWorkforceIntegration`: o grupo antigo não é reconciliado na mudança de correspondência. Pode duplicar custo no mesmo rascunho. |
| B02 / Alta | Plano v1 com Financeiro 200 + Comercial 100; substituir pela v2 que contém apenas Financeiro 300 e reaplicar no mesmo rascunho: esperado 300; resultado 400. | `switchWorkforceVersion` desativa o mapeamento sem sucessor, mas `applyWorkforceIntegration` só aplica os ativos. O valor antigo da dimensão retirada permanece em `performance_entries`. |
| B03 / Alta | Fonte com janeiro 100 e fevereiro 200; atualização completa passa a conter só janeiro; depois de aplicar, fevereiro continua em 200. | `checkForUpdates` só marca ausentes como obsoletos para períodos presentes no lote. Falta declarar cobertura/completude da atualização; lote vazio ou mês totalmente retirado não reconcilia o saldo anterior. |
| B04 / Alta | Em `ComConfirmacao`, retirar um dos dois movimentos do mesmo mês e reaplicar sem confirmar: orçamento cai de 300 para 100. | A remoção torna o movimento `Obsoleto` imediatamente, contornando a retenção do último valor confirmado aplicada às alterações de valor. |
| B05 / Alta | Valor confirmado 100; alteração pendente 200; a fonte volta a 100; confirmar e aplicar: resultado 200. | A comparação com o fingerprint confirmado termina como «inalterado» e deixa a alteração pendente antiga. Confirmar pode promover um valor que a fonte já retirou. |
| B06 / Alta | Célula com edição manual protegida de 500, antes da primeira integração; aplicar origem de 100: célula passa a 100. | `applyMapping` respeita `adjustment_mode='Bloquear'`, mas não lê `manual_override` da célula pré-existente. A proteção usada pelo motor de pressupostos não cobre a primeira aplicação de integração. |
| B07 / Alta | Orçamento aprovado com custo RH 100; desativar o mapeamento atual: valor guardado continua 100, mas a consulta de pessoal usada pelos dashboards deixa de o selecionar. | `PERSONNEL_COST_LINE_CODES_SUBQUERY` usa mapeamentos ativos e catálogo atuais. O mapa congelado pode divergir do indicador histórico de pessoal sem alterar um único valor aprovado. |
| B08 / Média | Gravar célula de código inexistente `UNKNOWN`: API devolve 200 e persiste 500. | `batchSaveBudgetCells` não valida existência/tipo da rubrica no catálogo. Pode criar valores fora do mapa e divergências entre consumidores; importação utiliza o mesmo caminho. |
| B09 / Média | Criar integração RH para rubrica inexistente: resposta HTTP 200, nenhum mapeamento e lista `errors`. | `ensureDepartmentMappings` devolve erros no corpo com sucesso HTTP; a UI `createRhIntegration` interpreta `r.ok` como integração criada. Mostra sucesso sem integração funcional. |

### Lacunas de interface confirmadas por leitura do código

1. **Confirmação incompleta:** existe `confirmMovements` no backend, mas não há chamada desta ação nas interfaces de `app/`. O painel oferece sincronizar/aplicar e a opção ComConfirmação sem expor o ciclo completo de confirmação.
2. **Falhas silenciosas:** `switchRhVersion`, `recordRhDecision` e `removeAssumption` não verificam `response.ok`. A troca pode apresentar a mensagem de sucesso mesmo quando a API a recusou.
3. **Origem resumida:** a API devolve contribuições e movimentos congelados, mas o painel da célula só mostra total, componente automática, ajuste e módulo/estado. Não apresenta o detalhe de movimentos, versão/plano e composição disponível.
4. **Impacto pendente pouco persistente:** após criar uma integração, o painel troca para sincronizar/aplicar. Os `pendingDepartments` e `errors` devolvidos pela criação/sincronização não são tratados na resposta; perde-se a visão explícita da parte excluída do orçamento.
5. **Excel sem contrato de reimportação:** exporta também rubricas agregadoras; importa todas as linhas com código, sem excluir agregadoras nem validar que o ano dos cabeçalhos coincide com o exercício selecionado. Uma célula em branco torna-se zero. É necessária validação integral/pré-visualização antes da escrita.

Estas verificações são de código; não se declara que cada estado de interface foi reproduzido num navegador nesta auditoria.

## O que está bem e deve ser preservado

- Isolamento por tenant e âmbito de empresa nos caminhos já cobertos pelos testes.
- Identidade de célula por versão/empresa/moeda/dimensão/período, incluindo vista agregada só de leitura.
- Bloqueio de escrita em versões aprovadas e snapshot de rubricas e evidência aplicada.
- Cálculo de quantidade × preço, crescimento simples/composto, sazonalidade e contratos.
- Separação entre valor integrado e ajuste manual nas células já integradas.
- Soma idempotente de fontes já aplicadas e controlo de escrita concorrente no agregado.
- Plano RH aprovado como origem, escolha explícita de versão e correspondências humanas de departamento.
- Compatibilidade com dados antigos, sem reescrever o histórico para fabricar evidência que não foi capturada.

## Pendências funcionais reais

| Tema | Estado e requisito para continuar |
|---|---|
| RH → orçamento | Corrigir B01–B07 e fechar confirmação, mensagens, origem e reconciliação. Não construir segundo adaptador RH. |
| Investimentos/CAPEX | Falta adaptador de origem real. Diagnosticar investimento, depreciação e calendário de pagamentos separadamente antes da implementação. |
| Semântica das projeções mensais | Em `financial_models`, `statement_amount_minor` e `cash_amount_minor` recebem o mesmo montante assinado; o desfasamento fica em `cash_period`. O tipo da linha e o período têm de ser considerados. CAPEX não deve virar custo operacional; Financiamento não deve virar Receita. |
| Tesouraria previsional integrada | A tesouraria operacional já existe (`worker/treasury.ts`), mas o motor do orçamento continua a rejeitar aplicar natureza `Financeiro` ao mapa económico. Falta a ligação explícita ao destino previsional de caixa, não a tesouraria inteira. |
| Financeiro/Forecast → orçamento | O contrato aceita os nomes de fontes, mas só foi encontrado adaptador real de RH. Não confundir um enum disponível com integração construída. |
| Pressupostos Percentagem/Histórico | Existem no contrato/schema, mas o worker recusa a sua criação por não estarem operacionais. Não apresentá-los como concluídos. |
| Plano mensal → orçamento anual | Persistências e versões próprias, sem transferência automática. Definir correspondência, sinal, moeda, calendário e versão; usar o motor comum e confirmação, evitando nova cópia de funções. |
| Importação e exportação | Corrigir B08 e fechar contrato de ficheiro, rubricas analíticas, ano/meses, números, campos vazios e validação atómica. |

## Sequência de continuação

1. Transformar B01–B09 em testes de regressão e corrigir reconciliação, confirmação, proteção manual e leitura histórica. Não recalcular nem «corrigir» automaticamente versões já aprovadas.
2. Completar o painel existente do mapa anual: estado real, impacto pendente, confirmar alterações, modo de ajuste e detalhe da origem. Preservar campos, permissões, idiomas e layout aprovado.
3. Homologar o ciclo inteiro: selecionar versão RH → resolver departamentos → pré-visualizar → sincronizar → confirmar → aplicar → ajustar → aprovar → rever plano → reconciliar novo rascunho. Conferir mapa, Excel e indicadores RH/CFO no mesmo âmbito.
4. Concluir o diagnóstico de CAPEX e aprovar/implementar a ligação económica/caixa sem misturar investimento, depreciação, pagamento e financiamento.
5. Fechar as restantes fontes e pressupostos no motor existente e verificar importação/exportação e consumidores.

## Validação desta auditoria

- `node --test --test-concurrency=1 tests/budget-annual-map.test.mjs tests/budget-drivers.test.mjs tests/budget-integration.test.mjs tests/budget-resource-scope.test.mjs tests/workforce-budget-integration.test.mjs`: **61 testes passaram, zero falhas**.
- Nove cenários adicionais, executados contra os handlers reais e SQLite em memória com todas as migrações, reproduziram B01–B09. São provas diagnósticas; não se afirma que as expectativas de correção já passam.
- Script local de diagnóstico: `work/qa/budget-continuation-probes.mjs`; resultados: `work/validation/budget-continuation-probes.log`; baseline: `work/validation/budget-continuation-baseline.log`.
- A suite global de 570 testes passou na publicação anterior do PR #41. Não foi novamente executada nesta auditoria, que não alterou código funcional.
- Não foram inspecionados nem modificados registos reais de orçamento em produção nesta etapa; não é possível concluir que todos os dados existentes estão afetados por estes casos.

## Continuação autorizada após a auditoria

As correções B01–B09 e os controlos de confirmação/origem estão em implementação na branch `fix/budget-reconciliation-20261023`. Os testes de regressão estão em `tests/budget-reconciliation.test.mjs`; o contrato Excel é protegido por `tests/budget-map-import.test.mjs`.

A migração aditiva 0084 permite congelar, por empresa, a classificação de pessoal em futuras aprovações. As linhas históricas ficam com evidência NULL: não são reclassificadas retroativamente nem têm montantes alterados. Para integrações anteriores, a leitura usa a evidência aplicada e o código congelado quando disponíveis. A interface mantém o mapa existente e passa a mostrar alterações pendentes, confirmação, impacto de departamentos e contribuições de origem.

Validação local desta continuação: 583 testes na execução completa inicial; 18 testes específicos na revisão final; tipagem limpa, auditoria de idiomas no baseline 6 e QA React/API/SQLite para confirmar → aplicar → ajustar → mudar de contexto. A versão final ainda necessita do CI sobre o commit final e da verificação no navegador antes de publicação. CAPEX e as restantes fontes continuam fora desta correção.

Na revisão do navegador surgiu ainda uma pendência dos dados anteriores: versões aprovadas sem snapshot de rubricas apresentavam mapa vazio. A continuação acrescenta consulta plana dos códigos, nomes e montantes realmente guardados, com aviso de estrutura histórica indisponível; não reconstrói hierarquia nem fórmulas a partir do catálogo atual. A origem e a leitura histórica de pessoal usam a evidência aplicada quando existe. Testes adicionais protegem esta leitura, a troca para um plano com efetivo zero e a recusa de uma substituição com departamentos ainda por resolver.
