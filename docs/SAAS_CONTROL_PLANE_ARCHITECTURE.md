# Arquitetura do Control Plane SaaS

## Componentes

- **Public Web:** marketing, catálogo, preços, documentação e entrada no registo; não consulta dados empresariais.
- **Identity:** registo, email verificado, palavra-passe gerida por serviço especializado, recuperação, MFA, sessões e proteção contra abuso.
- **Commerce:** catálogo versionado, preços, ofertas, checkout, subscrições, faturas, pagamentos e créditos.
- **Entitlements:** converte itens contratados em capacidades técnicas; a API é a autoridade de enforcement.
- **Provisioning:** cria tenant, organização ROOT, Owner, configurações e entitlements com idempotência.
- **Operator Console:** Customer 360 comercial, cobrança, saúde técnica e trilho operacional.
- **Data Plane:** módulos empresariais isolados, com tenant, organização, RBAC, workflow e auditoria.

## Ordem de autorização

Uma chamada empresarial é autorizada somente quando:

1. A identidade e a sessão são válidas.
2. A membership está ativa.
3. O tenant está operacional.
4. A subscrição permite utilização.
5. O entitlement do módulo está ativo.
6. O papel possui a permissão necessária.
7. O recurso pertence ao tenant e ao âmbito organizacional.

## Fronteiras de dados

- O Control Plane guarda identidade comercial, contratos, faturação e estado operacional.
- O Data Plane guarda colaboradores, salários, orçamento e performance.
- O operador vê metadados e métricas agregadas, não payloads empresariais.
- Dados de cartão permanecem no prestador de pagamento; guardamos apenas identificadores e estado.
- Palavras-passe são responsabilidade do serviço de identidade.

## Eventos essenciais

| Evento | Produtor | Consumidor | Garantia |
|---|---|---|---|
| `identity.email_verified` | Identity | Onboarding | Idempotente |
| `checkout.completed` | Commerce | Subscription | Assinatura validada |
| `payment.succeeded` | Billing provider | Commerce | Webhook deduplicado |
| `subscription.activated` | Subscription | Entitlements | Versão monotónica |
| `tenant.provision.requested` | Commerce | Provisioning | Chave idempotente |
| `tenant.provisioned` | Provisioning | Portal | Auditável |
| `subscription.suspended` | Subscription | Gateway | Fail closed em writes |

## Disponibilidade e falhas

- Webhooks são persistidos antes do processamento.
- Reprocessamento não cria segundo tenant, fatura ou entitlement.
- Indisponibilidade momentânea do Billing não interrompe clientes ativos dentro da janela autorizada.
- Uma subscrição desconhecida falha fechada para writes.
- O Data Plane consulta entitlements internos materializados, não o prestador em cada request.

## Acesso de suporte futuro

Fluxo `solicitação → consentimento → âmbito → expiração → sessão → auditoria → revogação`. Impersonation silenciosa e acesso permanente são proibidos.
