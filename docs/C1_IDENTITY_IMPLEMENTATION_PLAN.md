# C1 — Plano de implementação da identidade pública

**Estado:** preparado; bloqueado apenas por provisionamento do Identity Provider e autorização de publicação pública.

## Situação verificada

- O site de produção está atualmente em acesso `custom`, não público.
- Não existem variáveis de ambiente de identidade configuradas no projeto Sites.
- Os projetos Supabase existentes pertencem a outros produtos e estão inativos.
- Reutilizar `greeleo-workflow` ou `yelacore` violaria a separação de domínios e não é permitido.

## Decisão

Criar um projeto Supabase dedicado à Enterprise Performance Platform. Utilizar Supabase exclusivamente como Identity Provider nesta fase; o Control Plane continua com modelo próprio e o Data Plane não é movido por esta decisão.

## Configuração de identidade

- Email + palavra-passe ativados.
- Verificação de email obrigatória.
- Recuperação de palavra-passe por email.
- MFA TOTP disponível; obrigatório para operadores e recomendado para Owners.
- Telefone recolhido no perfil comercial em E.164.
- Verificação SMS adiada até seleção de fornecedor com entrega validada em Angola.
- Social login fora do primeiro slice.

## Modelo local associado

### `accounts`

- `id`
- `identity_provider`
- `identity_subject`
- `email_normalized`
- `display_name`
- `country_code`
- `locale`
- `status`
- `email_verified_at`
- `created_at`

### `account_phones`

- `account_id`
- `calling_code`
- `national_number`
- `e164`
- `verified_at`

### `consents`

- `account_id`
- `policy_type`
- `policy_version`
- `granted`
- `occurred_at`
- `evidence_hash`

## Fluxos a implementar

1. `/` — site público e proposta de valor.
2. `/registar` — nome, email, password, país, indicativo, telefone e consentimentos.
3. `/verificar-email` — estado de verificação e reenvio controlado.
4. `/entrar` — email/password e recuperação.
5. `/onboarding/modulos` — apenas conta verificada.
6. `/app` — apenas membership e tenant válidos.

## Proteção de rotas

- Marketing permanece público.
- Registo e login permanecem públicos, com rate limit.
- Checkout exige account ativa e email verificado.
- Aplicação exige account, membership e tenant.
- APIs empresariais deixam de depender de headers do ambiente ChatGPT e passam a validar JWT do provider.
- Durante a migração, não existirão dois caminhos de autenticação com permissões divergentes.

## Migração segura da identidade atual

1. Criar o provider dedicado e ambiente de desenvolvimento.
2. Implementar validação de JWT e testes sem abrir o site.
3. Criar account do Owner e associar à membership administrativa existente.
4. Validar login, tenant e RBAC em preview.
5. Publicar landing e autenticação.
6. Alterar acesso do Sites para público somente após testes e autorização explícita.
7. Remover o bootstrap automático baseado em headers ChatGPT.

## Variáveis esperadas

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_JWKS_URL`
- `AUTH_ISSUER`
- `AUTH_AUDIENCE`, quando configurada

Chaves administrativas nunca são enviadas ao browser. O frontend recebe apenas a publishable key.

## Testes obrigatórios

- Registo e email duplicado.
- Verificação obrigatória.
- Password reset sem enumeração de contas.
- JWT expirado, assinatura inválida, issuer e audience incorretos.
- Account bloqueada.
- Membership inexistente.
- Tentativa cross-tenant.
- Rate limit de registo, login e reenvio.
- Consentimento com versão e evidência.
- Migração do Owner sem perda de acesso.

## Gate para C1

O Sprint C1 só termina quando um utilizador externo consegue registar-se e verificar o email, mas ainda não consegue criar empresa ou aceder a módulos sem checkout e provisionamento válidos.
