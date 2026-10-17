# Continuação — automatização e layout lateral

Pedido de 17/10/2026: aplicar o formato de menu lateral verde da referência, com módulos recolhidos que expandem ao clique, e construir a ligação automática entre fontes e análise.

## Layout

Menu lateral verde fixo em desktop; área de trabalho clara utiliza a largura restante. Módulos iniciam recolhidos; um clique abre/fecha a secção. Selecionar um submódulo mantém a secção aberta no desktop. Smartphone usa menu lateral com botão, fundo de fecho, Escape, foco contido e devolução do foco. Filtros de subscrição, permissões e mudança de empresa permanecem no fluxo existente. Não se alteraram as páginas públicas ou o portal do colaborador.

## Fluxo para o gestor

Finanças → Automatização da análise:
1. Selecionar organização, moeda e mês encerrado.
2. Guardar premissas e referências uma vez, com revisão e auditoria.
3. Importar CSV/XLSX do ERP (código, descrição, papel analítico e valor), ou descarregar o modelo.
4. Rever a prévia, resolver rubricas pendentes e excluir totais que dupliquem contas de detalhe (IGNORE).
5. Confirmar que os fluxos são mensais, não acumulados, e confirmar a importação.
6. Os mapeamentos são reutilizados por empresa/origem/código nas importações seguintes, tanto na prévia como na API.
7. Cockpit CFO usa a fonte importada do período quando executivo=1 e a organização está identificada. Tesouraria mantém os seus movimentos/documentos. Nenhum lançamento contabilístico ou performance_entry é criado por este fluxo.

Limites: CSV/XLSX até 5 MB na interface, 500 linhas normalizadas por período. Importação é por mês encerrado; posições são de fim de mês e receitas/custos/fluxos são mensais. Não somar contas pai e filhas. O primeiro mapeamento exige revisão; descrições exatas recebem apenas sugestões sujeitas à confirmação. Não há classificação cega por número de conta ou país.

## Motor e dados

Migration 0067_analysis_automation.sql cria premissas, importações versionadas, linhas e mapeamentos. Importação repetida é idempotente. Substituição exige identificar versão/revisão ativa; conserva a anterior. Dados, mapeamentos e auditoria são uma transação com até cinco statements, incluindo ficheiros de 500 linhas. Não se alteram dados se a auditoria falhar.

Valores desconhecidos são indisponíveis, não zero. O motor distingue cobertura de resultados, posições atuais, posições anteriores e caixa. Receitas/resultados conhecidos continuam disponíveis mesmo sem balanço; caixa e rácios de capitais não são inventados. Capitais médios exigem posições anteriores; acumulados exigem todos os meses e posições anteriores ao início do ano.

WACC, imposto, crescimento, perpetuidade, CAPEX, fundo de maneio, depreciação e referências podem ser guardados por organização/moeda. DCF usa essas premissas e a receita/margem/dívida da fonte. Configurações locais de um cenário continuam estimativas, não dados realizados.

VAB de gestão usa OUTPUT − INTERMEDIATE_CONSUMPTION quando ambas as rubricas existem. Valor por pessoa usa efetivo médio contratual do mesmo período, se o histórico for utilizável e a média positiva. Método base: https://ec.europa.eu/eurostat/web/esa-supply-use-input-tables/methodology . Não se afirma equivalência estatística completa sem validar as bases de valorização da fonte.

## Estado e limites

337 testes locais aprovados antes da publicação; incluem migração real, reutilização de mapeamentos no servidor, idempotência, substituição/revisões, permissões por empresa, rollback, batch limitado, ligação ao CFO, prioridade da fonte analítica sem alterar Tesouraria, cobertura e ausência de valores fabricados. Typecheck e catálogo de cinco idiomas verificados. Não houve validação visual num navegador autenticado nem inspeção física da impressão.

Ainda requerem informação externa: ligação direta autenticada à API específica de cada ERP, um ficheiro real para afinar o mapeamento, e referências setoriais/licenciadas ou regras oficiais de certificação. Não existe atualização automática externa de uma base setorial que não tenha sido fornecida. A automatização entregue recalcula a análise depois da importação autenticada e reutiliza configurações; não promete recolher dados de sistemas sem ligação configurada.
