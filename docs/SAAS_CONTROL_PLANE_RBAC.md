# Matriz RBAC do SaaS comercial

## Papéis do cliente

| Operação | Buyer | Owner | Billing Admin | Tenant Admin | Utilizador |
|---|---:|---:|---:|---:|---:|
| Criar checkout | ✓ | ✓ | ✓ | — | — |
| Consultar subscrição | ✓ | ✓ | ✓ | leitura | — |
| Alterar pagamento | — | ✓ | ✓ | — | — |
| Upgrade | — | ✓ | ✓ | — | — |
| Downgrade/cancelamento | — | ✓ | ✓ | — | — |
| Criar empresa após pagamento | ✓ | ✓ | — | — | — |
| Administrar utilizadores | — | ✓ | — | ✓ | — |
| Atribuir papéis empresariais | — | ✓ | — | ✓ | — |
| Usar módulo | entitlement + RBAC | entitlement + RBAC | entitlement + RBAC | entitlement + RBAC | entitlement + RBAC |
| Autorizar suporte temporário | — | ✓ | — | configurável | — |

## Papéis do operador

| Operação | Platform Owner | Billing Ops | Customer Success | Support Engineer | Security Auditor |
|---|---:|---:|---:|---:|---:|
| Gerir catálogo | ✓ | leitura | leitura | — | leitura |
| Consultar clientes/subscrições | ✓ | ✓ | ✓ | metadados | leitura |
| Crédito/reembolso | aprovação | executar | — | — | auditar |
| Suspensão comercial | aprovação | executar | propor | — | auditar |
| Reprocessar provisionamento | ✓ | — | solicitar | executar | auditar |
| Ver dados empresariais | — | — | — | sessão aprovada | auditar |
| Entitlement manual | exceção auditada | — | — | — | auditar |
| Audit trail operacional | ✓ | limitado | limitado | próprio | ✓ |

## Princípios

- Papéis do operador nunca equivalem a papéis dentro do tenant.
- Billing Ops não vê Payroll nem dados financeiros empresariais.
- Customer Success vê adoção agregada, não conteúdo.
- Reembolso, suspensão e entitlement excecional exigem motivo e segregação.
- Toda sessão de suporte possui tenant, âmbito, aprovador, motivo e expiração.
