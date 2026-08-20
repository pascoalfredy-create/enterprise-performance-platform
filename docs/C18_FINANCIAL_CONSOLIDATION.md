# C18 — Consolidação Financeira Multimoeda

## Objetivo

Consolidar Actual de várias empresas e moedas numa moeda de reporte, com taxas versionadas, drill-down, eliminações documentadas e aprovação segregada.

## Regras

- Taxas são armazenadas com precisão fixa de oito casas (`scale=100000000`).
- A moeda de origem deve ser diferente da moeda de reporte.
- Um conjunto de taxas é aprovado por maker-checker e torna-se imutável.
- A conversão usa inteiros e arredondamento determinístico para unidades mínimas.
- Cada linha consolidada conserva organização, moeda original, valor original, taxa, valor convertido, contagem e hash das fontes.
- Eliminações e ajustamentos são append-only e exigem motivo e evidência.
- A aprovação final valida no banco: total convertido + ajustamentos = total reportado.
- A IA não participa em taxas, conversões ou eliminações.
