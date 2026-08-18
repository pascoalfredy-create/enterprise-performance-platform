# Enterprise Performance Platform

Plataforma SaaS modular para Finance/FP&A, HCM, Payroll, Workforce Planning, Performance Management e Analytics & Reporting.

O produto é agnóstico a país, setor, ERP, plano de contas e norma contabilística. Regras fiscais, laborais e financeiras específicas são fornecidas por configuração, mappings e packs externos ao Core.

## Estado atual

O repositório contém o primeiro vertical slice empresarial funcional e auditável:

`Organization → User → Employee → Contract → Financial Dimensions → Actual/Budget → Payroll Run → Workforce Cost → Dashboard → Management Report`

Também estão implementados isolamento multi-tenant, RBAC, workflow determinístico, audit trail imutável, migrations formais, controlos de concorrência e API OpenAPI 3.1.

O registo público, billing, catálogo comercial, subscrições, entitlements, provisionamento automático e backoffice do operador ainda estão em fase de arquitetura.

## Arquitetura

- **Control Plane:** identidade pública, catálogo, billing, subscrições, entitlements, provisionamento e operações SaaS.
- **Data Plane:** espaços empresariais isolados onde funcionam os módulos contratados.
- **Country/Industry Packs:** regras específicas sem alteração do Core.
- **AI futura:** assistência e explicação; nunca fonte de verdade para cálculos.

## Documentação principal

- `docs/SAAS_COMMERCIAL_BLUEPRINT.md`
- `docs/SAAS_CONTROL_PLANE_ARCHITECTURE.md`
- `docs/SAAS_CONTROL_PLANE_DATA_MODEL.md`
- `docs/SAAS_CONTROL_PLANE_RBAC.md`
- `docs/SAAS_COMMERCIAL_ROADMAP.md`
- `docs/EMPLOYEE_MASTER_CONTRACTS.md`

## Comandos

- `npm run dev` — ambiente local.
- `npm run build` — build e validação do artefacto Sites.
- `npm test` — build e testes automatizados.
- `npm run lint` — validação estática.
- `npm run db:generate` — geração de migrations Drizzle.

## Princípios não negociáveis

- Nenhum cálculo financeiro ou salarial depende de IA.
- Nenhuma palavra-passe, token de pagamento ou dado de cartão é armazenado em texto simples.
- Subscrição, entitlement e RBAC são controlos diferentes.
- A equipa operadora não recebe acesso normal aos dados financeiros ou salariais dos clientes.
- Todo acesso excecional de suporte deve ser consentido, temporário e auditado.
