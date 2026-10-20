# Espaço de trabalho simplificado — 20/10/2026

Referência: maquete navegável aprovada Redesenho_Completo_Enterprise_Performance.html, versão 5. Aplicação incremental sobre os componentes funcionais existentes.

## Alterações

- Seletor de área na lateral, com todos os módulos disponíveis conforme a subscrição.
- Grupos expansíveis com cada destino operacional, incluindo operações de apoio e relatórios Analytics. A navegação por pesquisa ou ligações abre o grupo correspondente.
- Seletor contextual substitui filas extensas de separadores, preservando os destinos.
- Mapas em largura total com regresso ao contexto de trabalho; componentes e rascunhos de origem permanecem montados.
- Ficha do colaborador: separadores de dados na lateral e formulário em duas colunas, adaptado ao telemóvel; todos os campos e ações permanecem.
- Contraste explícito no hover e no foco. Menu móvel inclui o seletor no ciclo de foco e ignora controlos recolhidos.
- Paleta, espaçamento e navegação correspondentes à composição simplificada da maquete. Os dashboards e restantes componentes operacionais mantêm os dados reais e a lógica existente.

## Validação

Testes de renderização verificam todas as áreas e destinos, seleção atual, grupos recolhidos, ligações diretas, relatórios Analytics e restrições de subscrição. A suite integral e a compilação devem passar no CI antes do merge.

Esta entrega cobre a estrutura comum, leitura dos relatórios e disposição da ficha. Não representa revisão visual autenticada de todos os ecrãs. Comparação de screenshots e testes de interação num browser autenticado continuam necessários; o ambiente de execução local e browser autenticado não estão disponíveis nesta sessão.

Não altera motores financeiros, regras salariais, endpoints, migrações ou dados de produção. Preserva as oito correções da auditoria PR38.
