# C4 — Provisionamento após pagamento

## Objetivo

Converter exatamente um pagamento confirmado numa empresa isolada, subscrição ativa, organização ROOT, membership de Administrador e entitlements do bundle contratado.

## Invariantes

- O utilizador só provisiona pagamentos pertencentes à própria conta comercial.
- Um pagamento e um checkout só podem originar uma ordem e um tenant.
- Nome, slug, país, moeda e locale são configuração da empresa; não alteram o Core.
- O valor e bundle vêm do checkout persistido, nunca do browser.
- CORE é comum; os restantes módulos resultam exclusivamente do bundle.
- A operação é idempotente e deixa audit trail comercial e empresarial.
- Confirmação de teste continua segregada; cobrança real ainda não está ativa.

## Entitlements por bundle

| Bundle | Módulos ativos |
|---|---|
| Finance | CORE, Finance & FP&A, Analytics & Reporting, Workflow |
| People | CORE, HCM, Payroll, Analytics & Reporting, Workflow |
| Performance | CORE, Finance & FP&A, Workforce Planning, Performance Management, Analytics & Reporting, Workflow |
| Enterprise | Todos os anteriores e Integrations |

## Fora desta etapa

- renovação, upgrade, downgrade, suspensão e cobrança recorrente;
- cálculo fiscal final e fatura fiscal;
- integração ProxyPay real;
- configuração automática de Country Pack.
