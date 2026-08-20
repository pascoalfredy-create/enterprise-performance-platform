# C24 — Workforce Headcount Planning

## Objetivo

Planear headcount e custo mensal por organização, função, departamento e período, comparando o plano com o Employee Master e os perfis salariais ativos.

## Entidades e regras

- `workforce_plans`: horizonte, moeda, versão e workflow do plano.
- `workforce_plan_lines`: função, departamento, período, headcount, custo unitário, tipo de movimento e pressuposto.
- Valores monetários são guardados em minor units inteiras.
- Linhas são append-only e só podem ser criadas no horizonte de um plano em rascunho.
- Tipos de movimento: Base, Nova contratação, Substituição e Redução.
- O Core não calcula impostos nem encargos patronais presumidos; estes serão fornecidos por Country Packs versionados.

## Workflow e RBAC

`Rascunho → Submetido → Aprovado`. Um plano precisa de linhas antes da submissão. O aprovador deve ser independente do criador e submissor. A API respeita tenant, âmbito organizacional, entitlement Workforce Planning e `workforce:write`.

## Integrações

- HCM fornece headcount atual.
- Payroll fornece salário-base atual através dos perfis ativos.
- Workforce Cost continua a receber custos reais de Payroll fechado.
- Finance/FP&A poderá consumir apenas planos aprovados em Budget e Forecast.
