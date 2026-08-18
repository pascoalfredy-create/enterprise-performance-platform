# Roadmap da camada comercial SaaS

## Sprint C0 — decisões e contratos

- Aprovar catálogo inicial e bundles.
- Definir trial, tolerância, suspensão, retenção e exportação.
- Selecionar Identity Provider e primeiro Billing Provider.
- Definir países e moedas do lançamento inicial.
- Aprovar termos, privacidade e consentimentos.

**Gate:** nenhuma integração é construída sem estas decisões.

## Sprint C1 — Identity pública

- Landing pública e registo.
- Conta, email verificado, telefone internacional e consentimentos.
- Login, recuperação, sessões e proteção contra abuso.
- Separação entre account pública e membership empresarial.
- Testes de identidade, enumeração, rate limit e takeover.

**Gate:** utilizador verificado entra no onboarding, mas ainda não cria tenant.

## Sprint C2 — catálogo e checkout de teste

- Produtos, features, preços, ofertas e versões.
- Seleção de módulos e resumo do pedido.
- Customer e checkout session no provider.
- Webhook assinado, persistido e idempotente.
- Portal de estado do pedido.

**Gate:** pagamento de teste confirmado gera uma única subscription ativa.

## Sprint C3 — entitlements e provisionamento

- Subscription items → entitlements.
- Tenant order e provisioning job.
- Criação idempotente de tenant, ROOT e Owner.
- Enforcement de entitlement no gateway/API.
- Onboarding inicial da empresa.

**Gate:** módulo não contratado retorna `403` mesmo por chamada direta à API.

## Sprint C4 — Customer Portal

- Plano, módulos, faturas e pagamentos.
- Upgrade imediato governado.
- Downgrade e cancelamento no fim do período.
- Contactos de faturação e ações necessárias.

## Sprint C5 — Operator Console

- Customer 360 comercial.
- Filas de cobrança e provisionamento.
- MRR, ARR, churn e utilização agregada.
- Reprocessamento seguro e audit trail.
- Sem acesso normal ao Data Plane.

## Sprint C6 — dunning e ciclo de vida

- Pagamento pendente, tolerância, suspensão e reativação.
- Notificações transacionais.
- Read-only e exportação conforme política.
- Retenção e encerramento governados.

## Ordem recomendada

Não continuar o HCM visual antes de concluir C0. Depois de C0, C1–C3 formam o primeiro vertical slice comercial. O HCM pode evoluir em paralelo somente quando a equipa e os testes permitirem, sem misturar responsabilidades entre Control Plane e Data Plane.
