# Modelo de dados do Control Plane

## Identidade e contacto

| Entidade | Campos essenciais | Regras |
|---|---|---|
| `accounts` | id, identity_provider_id, name, email, email_verified_at, status | email normalizado; identidade externa única |
| `account_phones` | account_id, country_code, calling_code, national_number, e164, verified_at | E.164 único quando verificado |
| `consents` | account_id, policy_type, policy_version, granted, occurred_at, evidence | append-only |

## Catálogo

| Entidade | Campos essenciais | Regras |
|---|---|---|
| `products` | code, name, status | capacidade comercial estável |
| `features` | code, name | capacidade técnica granular |
| `product_features` | product_id, feature_id, limit_json | mapping versionado |
| `prices` | product_id, currency, interval, amount_minor, tax_behavior, effective dates | imutável após utilização |
| `offers` | code, name, effective dates | pacote comercial |
| `offer_items` | offer_id, price_id, quantity | composição versionada |

## Commerce e billing

| Entidade | Campos essenciais | Regras |
|---|---|---|
| `billing_customers` | account_id, provider, provider_customer_id | sem dados de cartão |
| `checkout_sessions` | account_id, offer_id, provider_session_id, status, expires_at | idempotency key única |
| `subscriptions` | customer_id, status, currency, period dates, trial_end, cancel_at | estado controlado |
| `subscription_items` | subscription_id, product_id, price_id, quantity | snapshot contratual |
| `invoices` | subscription_id, provider_invoice_id, number, totals, status | minor units |
| `payments` | invoice_id, provider_payment_id, amount_minor, status, paid_at | referência externa única |
| `billing_events` | provider, external_event_id, type, payload_hash, received_at, processed_at | append-only e deduplicado |

## Provisionamento e acesso

| Entidade | Campos essenciais | Regras |
|---|---|---|
| `tenant_orders` | account_id, subscription_id, legal_name, country, currency, timezone, locale | uma ordem ativa por checkout |
| `provisioning_jobs` | order_id, idempotency_key, status, attempts, error_code | reprocessável |
| `tenant_links` | order_id, tenant_id, owner_membership_id | ligação Control/Data Plane |
| `entitlements` | tenant_id, feature_code, status, source_item_id, limits_json, valid dates, version | derivado da subscrição |
| `entitlement_snapshots` | tenant_id, version, payload_json, hash, created_at | leitura rápida e auditável |

## Operações

| Entidade | Campos essenciais | Regras |
|---|---|---|
| `operator_users` | identity_id, role, status | separado das memberships de clientes |
| `operator_audit_events` | actor, action, target_type, target_id, reason, occurred_at | append-only |
| `support_access_requests` | tenant_id, requested_by, approved_by, scope, expires_at, status | sem aprovação implícita |
| `usage_counters` | tenant_id, feature_code, period, quantity | apenas métricas necessárias |

## Decisões

- Valores monetários usam unidades mínimas inteiras.
- Telefones usam E.164 e componentes normalizados.
- O hash do webhook é permanente; retenção do payload segue política mínima.
- Entitlements são derivados de subscription items, nunca de botões manuais sem evento e auditoria.
- IDs do prestador são referências, não chaves primárias do domínio.
- Control Plane e Data Plane podem começar juntos, mas mantêm schemas e interfaces separados.
