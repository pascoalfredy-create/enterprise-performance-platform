# C28 — Payroll Retroactive Adjustments

## Objetivo

Corrigir diferenças de períodos anteriores sem reabrir nem modificar Payroll Runs fechados.

## Entidades e regras

- Ajuste: colaborador, tipo, natureza, período de origem, período de pagamento, moeda, montante, motivo e evidência.
- Aplicação: ligação imutável ao Payroll Run e à linha salarial onde o ajuste foi calculado.
- Valores são inteiros em unidades monetárias mínimas; `Earning` aumenta o bruto e `Deduction` aumenta as deduções.
- O período de origem não pode ser posterior ao período de pagamento.

## Workflow e integração

O fluxo é `Pendente → Aprovado/Rejeitado → Processado`, com maker-checker. Um ajuste aprovado é incluído uma única vez no Payroll do período e moeda correspondentes. Apenas o fecho do run o marca como processado. O snapshot e o recibo preservam referência, origem, motivo e valor.

## Segurança e auditoria

O endpoint exige entitlement PAYROLL, `payroll:read`/`payroll:write` e âmbito organizacional. Registos e aplicações não podem ser apagados. Cada pedido e decisão produz evento de auditoria.
