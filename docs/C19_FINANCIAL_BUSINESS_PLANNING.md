# C19 — Modelação Financeira e Plano de Negócios

## Objetivo

Transformar pressupostos financeiros configuráveis em projeções mensais de resultados e cash-flow, sem depender de país, setor, ERP, plano de contas ou norma contabilística.

## Entidades e regras

- `financial_models`: organização, moeda, período inicial, horizonte de 1 a 240 meses, caixa inicial, versão e workflow.
- `financial_model_lines`: receita, custo, CAPEX, financiamento, imposto ou outro; valor base, crescimento mensal em basis points e prazo de caixa.
- `financial_projections`: resultado mensal, período de caixa e hash da fórmula por linha.
- Todos os valores monetários usam unidades mínimas; percentagens usam basis points; capitalização e arredondamento são executados com `BigInt`.
- Linhas e projeções são append-only e não podem ser alteradas ou eliminadas.
- Workflow: `Rascunho → Calculado → Aprovado`.
- A aprovação exige utilizador diferente do criador e do calculador.

## Interface e integração

O workspace apresenta drivers, demonstração projetada, CAPEX, financiamento, cash-flow mensal, saldo mínimo, risco de liquidez e hashes de evidência. O motor pertence a `FINANCE_FP&A` e usa as organizações e permissões partilhadas do Core.

## Testes

Cobertura obrigatória: referências tenant/organização, intervalos, imutabilidade, reconciliação mensal, transições, maker-checker, permissões e contrato OpenAPI.
