# C5 — Portal orientado por entitlements

## Objetivo

Transformar a aplicação empresarial existente num portal acessível apenas após autenticação, membership ativa e entitlement do módulo.

## Decisões

- Todas as chamadas do browser passam a transportar o access token Supabase quando disponível.
- O tenant ativo é enviado explicitamente e continua validado contra memberships no servidor.
- A navegação é derivada de `SecurityContext.modules`; ocultar um item não substitui a validação no gateway.
- A criação de novas empresas foi removida do portal. Uma empresa adicional exige novo fluxo comercial.
- O módulo Pessoas usa o motor HCM real de contratos e respetivas transições auditáveis.

## Navegação

| Área | Entitlement |
|---|---|
| Visão geral | ANALYTICS_REPORTING |
| Planeamento | FINANCE_FP&A |
| Pessoas | HCM |
| Operações / Payroll | PAYROLL |
| Análises de workforce | WORKFORCE_PLANNING |
| Relatórios | ANALYTICS_REPORTING |
| Controlo e Administração | CORE + RBAC |

## Próximo slice

Substituir os últimos dados ilustrativos da visão inicial por estados vazios e dados do tenant; depois completar Organization, User, Employee e Financial Dimensions no onboarding da primeira empresa.
