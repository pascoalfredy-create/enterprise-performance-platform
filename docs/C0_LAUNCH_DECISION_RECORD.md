# C0 — Registo de decisões para lançamento SaaS

**Estado:** aprovado pelo Product Owner para planeamento e execução faseada
**Data de verificação:** 19 de agosto de 2026  
**Mercado inicial recomendado:** Angola, com arquitetura preparada para expansão internacional

## 1. Decisão de identidade

### Recomendação: Supabase Auth

Utilizar Supabase Auth como Identity Provider, sem transferir para ele o domínio empresarial ou o billing.

**Responsabilidades do fornecedor:**

- criação segura de credenciais;
- email e palavra-passe;
- verificação de email;
- recuperação de palavra-passe;
- sessões e refresh tokens;
- MFA por TOTP e, futuramente, telefone;
- armazenamento e verificação segura das palavras-passe.

**Responsabilidades da plataforma:**

- `account` comercial associado ao identificador externo;
- nome, país, locale e telefone normalizado em E.164;
- consentimentos e versões das políticas;
- memberships, tenants, subscrições, entitlements e RBAC;
- bloqueio comercial e estados de onboarding.

### Motivo

- O serviço suporta email/password, verificação de email e MFA.
- Tokens podem ser validados no backend sem acoplar o Data Plane à base de identidade.
- Evita desenvolver e armazenar palavras-passe no Core.
- Mantém maior controlo sobre tenants e permissões do que adotar o modelo de organizações de um fornecedor como fonte de verdade.

### Alternativas analisadas

| Fornecedor | Pontos fortes | Limitações para este produto | Decisão |
|---|---|---|---|
| Supabase Auth | Email/password, MFA, JWT, controlo técnico | SMS exige configuração/provedor; novo serviço externo | Recomendado |
| Clerk | UI pronta, email/password, MFA e B2B | Telefone em produção e B2B avançado podem acrescentar custo; organizações duplicariam o nosso domínio | Reserva |
| Auth0 | Maturidade enterprise e MFA adaptativo | Custo e complexidade superiores no estágio atual | Futuro enterprise |

### Política inicial de telefone

- Telefone é obrigatório no cadastro comercial.
- É guardado em E.164 com país e indicativo separados.
- Email verificado é obrigatório para ativar a conta.
- Verificação de telefone não bloqueia o MVP; passa a obrigatória para recuperação de alto risco, Billing Admin ou quando houver fornecedor SMS validado para Angola.
- MFA TOTP é obrigatório para Operator Console e recomendado para Owners.

## 2. Decisão de pagamentos em Angola

### Recomendação: ProxyPay como primeiro adapter

Usar uma interface interna `BillingProvider` e implementar ProxyPay como primeiro adapter de Angola.

Capacidades oficiais disponíveis:

- RPS para pagamentos por referência;
- OPG para pedidos via Multicaixa Express usando telefone;
- DDS para débitos recorrentes autorizados por mandato;
- ambiente sandbox documentado para DDS.

### Estratégia faseada

**Fase 1 — checkout e renovação assistida**

- AOA como moeda de cobrança.
- Referência Multicaixa e/ou Multicaixa Express.
- Confirmação assíncrona persistida e idempotente.
- Mensal e anual apresentados no catálogo, sujeitos à capacidade contratada.
- Nenhum tenant é provisionado apenas com retorno do browser; exige confirmação segura do provider.

**Fase 2 — cobrança recorrente**

- ProxyPay DDS após adesão bancária, obtenção de IEC e contrato/API key.
- Mandato separado da subscrição: um mandato pode estar pendente, ativo, rejeitado ou cancelado.
- Falha de débito inicia dunning; não elimina dados.

### AppyPay

Manter como alternativa comercial a avaliar. A empresa apresenta API e gateway para Angola, mas a seleção final exige proposta, SLA, sandbox, callbacks/webhooks, reconciliação, liquidação, reembolsos e custos documentados.

### Stripe

Não utilizar como pressuposto para a entidade angolana: Angola não consta atualmente da lista oficial de disponibilidade do Stripe. Uma integração internacional futura só deve ser ativada quando houver entidade e enquadramento legítimos num país suportado; não se deve contornar as regras do fornecedor.

## 3. Mercado, moeda e expansão

| Decisão | Recomendação C0 |
|---|---|
| Mercado inicial | Angola |
| Idioma inicial | Português |
| Locale inicial | `pt-AO` |
| Moeda de cobrança inicial | AOA |
| Moedas empresariais | Configuráveis e independentes do billing |
| Expansão | Novos adapters de identity communication e billing por país |

Mostrar equivalentes em USD pode ser útil comercialmente, mas o preço vinculativo, faturação, impostos e liquidação devem seguir a moeda e o enquadramento aprovado para a entidade vendedora.

## 4. Catálogo recomendado para lançamento

### Bundles

| Código | Nome | Inclui |
|---|---|---|
| `FINANCE` | Finance & FP&A | Finance Foundation, FP&A, reporting base e workflow financeiro |
| `PEOPLE` | HCM & Payroll | HCM Core, Payroll, reporting base e workflow de pessoas |
| `PERFORMANCE` | Enterprise Performance | Finance & FP&A, Workforce Planning, Performance Management e Analytics Advanced |
| `ENTERPRISE` | Enterprise Suite | Todos os módulos, Integration Hub e limites superiores |

### Add-ons

- Payroll Country Pack por país.
- Integration Hub.
- Analytics Advanced.
- Utilizadores ou volume adicional apenas quando existirem limites reais medidos.

### Princípio

Não cobrar separadamente por páginas técnicas internas. O cliente compra resultados e capacidades; workflow, dashboard básico e auditoria acompanham o módulo que deles depende.

## 5. Política comercial proposta

Política comercial aprovada como baseline C0, sujeita a revisão antes da entrada em produção:

| Tema | Proposta inicial |
|---|---|
| Trial | 14 dias, uma empresa, até 5 utilizadores |
| Forma de pagamento no trial | Não obrigatória |
| Periodicidade | Mensal e anual |
| Benefício anual | Dois meses equivalentes de desconto, a validar na precificação |
| Pagamento pendente | Writes críticos bloqueados após vencimento + tolerância |
| Tolerância | 7 dias |
| Suspensão | Read-only controlado por 30 dias |
| Cancelamento | Exportação disponível durante janela contratual |
| Retenção após encerramento | 90 dias, sujeita a validação jurídica e política de dados |

### Preços baseline aprovados — catálogo `AO-2026-01`

| Bundle | Mensal | Limites incluídos |
|---|---:|---|
| Finance & FP&A | 49.900 AOA | 5 utilizadores |
| HCM & Payroll | 59.900 AOA | 5 utilizadores e 25 colaboradores |
| Enterprise Performance | 99.900 AOA | 8 utilizadores |
| Enterprise Suite | 149.900 AOA | 10 utilizadores e 50 colaboradores |

- Utilizador adicional: 2.500 AOA/mês.
- Colaborador adicional em bundles com Payroll: 1.000 AOA/mês.
- Angola Payroll Pack incluído no lançamento.
- Anualidade equivalente a 10 mensalidades.
- Impostos aplicáveis são calculados no checkout e não estão hardcoded no Core.
- O catálogo é versionado; alterações posteriores não reescrevem subscrições contratadas.

## 6. Gating técnico

Nenhuma subscrição dá acesso diretamente por estado visual. A autorização empresarial exige:

`identity → account → membership → tenant status → subscription status → entitlement → RBAC → organization scope`

O provider de pagamento não escreve diretamente em `tenants` ou `entitlements`. Eventos entram em `billing_events`, são verificados, deduplicados e processados pelo domínio interno.

## 7. Ações externas antes do Sprint C1/C2

1. Solicitar proposta e sandbox à ProxyPay para RPS, OPG e DDS.
2. Confirmar com banco comercial os pré-requisitos para GPO/DDS e IEC.
3. Solicitar proposta comparativa à AppyPay.
4. Criar projeto de desenvolvimento do Identity Provider, sem credenciais de produção.
5. Validar termos, privacidade, retenção, faturação e fiscalidade com assessoria local.
6. Aprovar bundles e política comercial antes de inserir preços.

## 8. Fontes oficiais verificadas

- Supabase Auth — password-based authentication: https://supabase.com/docs/guides/auth/passwords
- Supabase Auth — MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Clerk — authentication strategies: https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options
- ProxyPay APIs: https://developer.proxypay.co.ao/
- ProxyPay DDS: https://developer.proxypay.co.ao/dds/v1/
- Multicaixa GPO: https://multicaixa.ao/oferta/canais/comerciantes/gateway-de-pagamentos-online/
- AppyPay: https://www.appypay.co.ao/
- Stripe global availability: https://stripe.com/global
