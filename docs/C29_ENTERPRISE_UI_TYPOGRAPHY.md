# C29 — Enterprise UI Typography

## Objetivo

Eliminar disparidades tipográficas entre módulos e impor uma escala única para toda a interface da plataforma.

## Escala

- **12 px — support:** metadados, legendas, estados, badges, códigos e texto auxiliar.
- **14 px — body:** navegação, tabelas, formulários, botões, conteúdo e texto operacional.
- **16 px — emphasis:** títulos, valores, totais e indicadores principais.

## Implementação

`ui-typography.css` é carregado globalmente e utiliza tokens semânticos. A classe raiz `ui-scale` aplica a escala a módulos atuais e futuros, incluindo portal, HCM, Payroll, Finance, Workflow, onboarding, checkout e Control Plane. A regra central prevalece sobre estilos legados sem alterar grelhas, espaçamento ou paleta.

## Qualidade

O contrato automatizado confirma a importação global, a presença exclusiva dos três tokens e a aplicação da classe raiz. Novos componentes devem usar os tokens e não introduzir tamanhos adicionais na base UI.
