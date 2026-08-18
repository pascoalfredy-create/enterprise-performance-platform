# Blueprint comercial SaaS

## Objetivo

Transformar o núcleo empresarial existente num produto público em que uma pessoa cria uma conta, verifica a identidade, seleciona módulos, contrata um plano e provisiona uma empresa isolada.

## Públicos

- **Visitante:** conhece o produto, módulos e preços.
- **Comprador:** cria a conta, escolhe a oferta e paga.
- **Owner da empresa:** conclui o provisionamento e administra utilizadores.
- **Utilizador empresarial:** usa apenas módulos e operações autorizados.
- **Operações SaaS:** acompanha subscrições, cobrança e saúde técnica.
- **Suporte:** atua somente por acesso temporário consentido.

## Jornada principal

1. Visitar o site público.
2. Criar conta com nome, email, país, indicativo e telefone.
3. Verificar o email.
4. Ativar MFA quando exigido pelo risco ou plano.
5. Selecionar módulos, plano e periodicidade.
6. Confirmar checkout num prestador de pagamentos.
7. Receber confirmação assíncrona e idempotente do pagamento.
8. Informar os dados legais e operacionais da empresa.
9. Provisionar tenant, organização principal e Owner.
10. Ativar entitlements contratados.
11. Executar onboarding e convidar utilizadores.

## Produtos comerciais iniciais

| Produto | Capacidades incluídas |
|---|---|
| Finance Foundation | Organização, dimensões, Actual/Budget e workflow |
| FP&A | Forecast, cenários, planeamento e modelação |
| HCM Core | Employee Master, contratos e estrutura |
| Payroll | Configuração, processamento, fecho, pagamentos e payslips |
| Workforce Planning | Headcount, posições, custos e cenários |
| Performance Management | Objetivos, avaliações, competências e feedback |
| Analytics Advanced | Dashboards, reporting, distribuição e governance |
| Integration Hub | APIs, ficheiros, ERP, bancos e conectores |

Reporting e Workflow básicos acompanham os produtos que deles dependem; não são vendidos como páginas vazias.

## Regras comerciais

- O catálogo é versionado; alterações de preço não reescrevem contratos existentes.
- Moeda, impostos e métodos de pagamento pertencem ao checkout/configuração local, não ao Core empresarial.
- O pagamento confirmado ou trial autorizado cria uma ordem de provisionamento.
- Falha de pagamento nunca elimina dados imediatamente.
- Upgrade adiciona entitlements após confirmação.
- Downgrade agenda remoção no fim do período e executa verificação de impacto.
- Cancelamento preserva exportação e retenção conforme política contratual.

## Estados principais

- Conta: `Pendente de verificação → Ativa → Bloqueada → Encerrada`.
- Subscrição: `Incompleta → Trial → Ativa → Pagamento pendente → Tolerância → Suspensa → Cancelada`.
- Provisionamento: `Pendente → Em execução → Concluído` ou `Falhou → Reprocessar`.

## Critérios de aceite do primeiro slice comercial

- Registo público e verificação de email.
- Checkout em modo de teste.
- Webhook assinado, idempotente e auditado.
- Criação de empresa somente após evento válido.
- Entitlements derivados da subscrição.
- Owner acede apenas ao tenant criado.
- Módulo não contratado é bloqueado na API e não apenas ocultado na UI.
- Operador acompanha cliente e cobrança sem ler dados sensíveis do Data Plane.

## Fora do primeiro slice

- Marketplace de packs, revendedores e comissões.
- Metered billing avançado.
- Múltiplos prestadores de pagamento em produção.
- Acesso de suporte ao Data Plane.
- Aplicações móveis.
