# C2 — Checkout persistente em modo de preparação

## Objetivo

Converter uma seleção autenticada num rascunho persistente, calculado no servidor e auditado, sem executar cobrança ou provisionar uma empresa.

## Entidades

- `commerce_accounts`: projeção mínima da identidade no Control Plane.
- `checkout_sessions`: snapshot do catálogo, bundle, periodicidade, utilização e total.
- `commerce_audit_events`: evidência append-only da criação do checkout.

## Regras de negócio

- Apenas identidade Supabase com email confirmado pode criar ou consultar o próprio checkout.
- O cliente envia bundle, periodicidade e quantidades; o servidor obtém o preço do catálogo `AO-2026-01`.
- Valores monetários são inteiros em cêntimos de AOA.
- A mesma identidade e seleção produzem a mesma chave idempotente enquanto o catálogo não mudar.
- `Rascunho` não cria tenant, subscription, entitlement, invoice ou payment.
- O Angola Payroll Pack permanece incluído nos bundles aprovados.

## Permissões e workflow

`Identidade verificada → Rascunho → Aguardar integração ProxyPay`

Não existe transição para `Pago` neste checkpoint. Operações SaaS e suporte não recebem acesso aos dados empresariais.

## API e UI

- `GET /api/v1/commerce/checkout`: último rascunho da conta autenticada.
- `POST /api/v1/commerce/checkout`: cria ou devolve o mesmo rascunho idempotente.
- UI: catálogo, periodicidade, limites, total e confirmação de rascunho sem cobrança.

## Testes e audit trail

- Recalcular preços no servidor e rejeitar bundles, intervalos ou quantidades inválidas.
- Confirmar desconto anual de duas mensalidades.
- Confirmar idempotência e imutabilidade do audit trail.
- Confirmar que o rascunho não toca em tenants ou entitlements.

## Integração futura

O adapter ProxyPay receberá apenas uma sessão persistida e válida. O retorno do browser nunca ativará a subscrição; isso dependerá de evento assinado, deduplicado e processado no Control Plane.
