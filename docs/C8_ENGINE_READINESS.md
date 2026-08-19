# C8 — Readiness operacional por motor

## Objetivo

Impedir que processos críticos sejam tratados como disponíveis apenas porque o módulo foi contratado. Entitlement concede acesso; readiness confirma se os pré-requisitos operacionais existem.

## Regras iniciais

| Motor | Pronto quando |
|---|---|
| Finance & FP&A | organização e dimensão financeira ativas |
| HCM | colaborador e contrato ativo |
| Payroll | contrato ativo e perfil salarial ativo |
| Workforce | existe Payroll Run fechado no âmbito |
| Reporting | existe Budget aprovado e cenários Actual/Budget comparáveis |

Cada resultado inclui evidência quantitativa, estado e próxima ação. A avaliação respeita tenant e eventual âmbito organizacional.

## Regra reforçada de reporting

Um Management Report já não pode ser emitido com uma narrativa baseada em zeros ou dados incompletos. A emissão exige:

- versão Budget selecionada e aprovada;
- pelo menos um lançamento Actual;
- pelo menos um lançamento Budget da versão;
- mesmo período, moeda, tenant e âmbito organizacional.

## Separação de responsabilidades

- Entitlement: contrato comercial.
- RBAC: autoridade do utilizador.
- Organization scope: limite de dados.
- Readiness: pré-condições operacionais.
- Workflow state: autorização da transição.
