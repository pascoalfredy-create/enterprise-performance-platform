# C3 — Billing em modo de teste

## Objetivo

Criar fatura e intenção de pagamento a partir de um checkout persistido, permitindo confirmação simulada somente ao Platform Owner. Não contactar ProxyPay nem provisionar empresa.

## Entidades

`operator_users`, `billing_invoices`, `payment_intents` e `billing_events`.

## Regras e permissões

- O servidor copia o valor imutável do checkout; o cliente não fornece montantes.
- Uma sessão gera no máximo uma fatura e uma intenção de pagamento.
- `PROXYPAY_TEST` não representa pagamento real e não emite referência Multicaixa.
- Apenas `Platform Owner` ativo pode confirmar a simulação.
- Eventos de billing são append-only e deduplicados por referência externa.
- Imposto permanece `Pendente configuração`; não existe taxa fiscal hardcoded.
- Confirmação não cria tenant, entitlement ou acesso a módulos.

## Workflow

`Checkout Rascunho → Fatura Aguarda pagamento → Test Intent Pendente → Confirmado`

O passo seguinte criará uma ordem de provisionamento apenas após consumir um evento válido e idempotente.

## APIs e UI

- `POST /api/v1/commerce/payment-intent`
- `POST /api/v1/commerce/test-confirmation` — restrito a Platform Owner
- `/checkout` — resumo, aviso de sandbox e estado do pagamento

## Testes e auditoria

Preço originado do checkout, segregação de operador, confirmação compare-and-set, evento imutável e ausência de escrita em tenants.
