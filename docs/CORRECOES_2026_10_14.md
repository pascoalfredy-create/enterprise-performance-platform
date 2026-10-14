# Correções independentes — 14/10/2026

Base: código do commit e2657f86a6881d4f9028c552c5e2b157fd0cda6a fornecido em ZIP. Esta entrega é uma cópia corrigida para integração. Nenhuma alteração foi publicada na plataforma online.

## Alterações entregues

| Área | Alteração |
|---|---|
| Isolamento | Linhas de planos de efetivos e modelos financeiros filtram a organização do recurso pai. |
| Integrações | Validação e decisão de runs respeitam a organização; contagens inválidas são rejeitadas. |
| Recrutamento | Autorização dos IDs de vagas, candidaturas, casos e tarefas antes das mutações; tarefas filtradas por organização; fecho/cancelamento de vagas e proteção contra tarefas em casos concluídos. |
| Concorrência | Conflitos na abertura de vagas e transição de candidaturas retornam 409. |
| Payroll | Fecho e liquidação de empréstimos/ajustes executados na mesma transação SQLite, através de trigger. A transição e a sua auditoria são executadas num batch atómico. |
| Duplicações | Garantia por colaborador/período/moeda, incluindo sobreposição entre run global e local. |
| Correção de Payroll | Anulação de runs não fechados, preservando linhas históricas e libertando reservas de deduções; nova geração permitida. |
| Salários | Revisão por nova vigência com perfil anterior preservado; bloqueio de alteração perante runs existentes no período e incompatibilidade monetária com obrigações abertas. |
| Moedas | Empréstimos/ajustes exigem moeda válida e compatível com perfil; saldos apresentados por moeda; moedas incompatíveis são verificadas novamente na aprovação. |
| Aprovações | Empréstimos e ajustes exigem Administrador independente do solicitante; preparação e aprovação do lote salarial exigem atores diferentes. Não se inventou um limite monetário por valor. |
| Prestações | Não são permitidas prestações de valor zero. |
| Cancelamentos | Solicitante pode cancelar empréstimo/ajuste pendente no seu âmbito. |
| Country Packs | Ativação fiscal indisponível enquanto não existir motor de regras validado; catálogo identificado como configuração; prontidão fiscal salarial não declarada como concluída. O motor genérico mensal continua disponível para validação e parametrização manual. |
| Datas | Seleção salarial usa o último dia real do mês, em vez de “dia 31” para todos os meses. Periodicidades não implementadas são recusadas. |
| Dashboard | Consultas recebem período e moeda; removidos comparação sem efeito e narrativa executiva fixa. Workforce apresenta custo real separado de ausência de orçamento comparável. |
| Relatórios | Oito itens do catálogo exportam snapshots de dados em JSON, com origem e metadados. Não são apresentados como PDFs nem como relatórios executivos completos. A previsão de 13 semanas permanece indisponível. |
| Navegação | Payroll Runs e Utilizadores/RBAC abrem diretamente o separador correspondente. |
| Efetivos | Headcount e custo planeados filtram mês selecionado, em vez de somar o horizonte inteiro. |
| Assiduidade | Atribuição de turno atómica com unicidade de turno ativo; seleção temporal de turnos históricos; autorização de entradas/timesheets; reabertura de timesheet rejeitado, com recálculo e evidência anterior em auditoria. |
| Consolidação | Ajustes identificam organização e parcela de NCI; total de NCI e interesse controlador reconciliam ajustamentos. Participação ausente bloqueia cálculo, em vez de assumir posse total. Leitura da consolidação exige âmbito global. |
| Valores | Parsing monetário determinístico aceita 1.234,56 e 1,234.56; rejeita formatos ambíguos, em vez de interpretar silenciosamente um valor errado. |
| Importação | Criador do lote financeiro não pode validar o próprio lote. |
| Carreiras públicas | Quotas atómicas por cliente/hora e tenant/dia; reaplicação anónima não altera perfil existente. A quota pode consumir uma tentativa mesmo quando uma candidatura é posteriormente recusada por duplicação. |
| Ficheiros | Verificação das assinaturas PDF/PNG/JPEG em vez de confiar só no MIME declarado. É verificação de formato, não análise antivírus. |
| Sessão | Refresh token guardado em sessionStorage; token antigo removido de localStorage ao guardar nova sessão. Não é proteção contra XSS. |
| Qualidade | Tipos de runtime Worker isolados dos tipos DOM, contratos de linhas tipados, correções de efeitos React e compatibilidade de buffers; comando typecheck acrescentado. |

## Validação

- `npm test`: build verificado e 240 testes aprovados.
- `npm run typecheck`: aprovado.
- 14 regressões adicionais cobrem acessos entre organizações, duplicação global/local, cancelamento, fecho atómico, falha injetada, parsing monetário, Country Pack bloqueado, NCI, formato de ficheiros e armazenamento de sessão.
- Auditoria de internacionalização mantém os cinco falsos positivos de análise estática existentes; novas frases visíveis foram adicionadas ao catálogo PT/EN/ES/FR/RU.
- Os testes locais usam dados fictícios e as migrações reais. Não equivalem a testes integrais de navegador em produção.

## Integração pelo Diretor Técnico

1. Comparar esta cópia com o repositório atual. Se houve novos commits após e2657f8, aplicar apenas o diff pertinente, resolvendo conflitos sem substituir trabalho posterior.
2. Instalar dependências pelo lockfile. Executar `npm run typecheck` e `npm test`.
3. Preparar uma cópia da D1 num ambiente de testes. Executar as migrações 0057, 0058 e 0059 pelo processo existente do projeto.
4. A migração 0057 falha intencionalmente se encontrar duplicações históricas de colaborador/período/moeda. A unicidade de turnos também recusa dados históricos inconsistentes. Resolver tais casos com evidência e decisão de negócio; não apagar registos para contornar a verificação.
5. Rever runs já fechados com deduções ainda “Calculada” ou ajustes ainda “Calculado”. O novo trigger garante os fechos futuros; não repara automaticamente operações históricas interrompidas. Essa reconciliação exige dados do ambiente real.
6. Testar duas organizações e perfis distintos: leitura, geração, validação, aprovação, fecho, recibos, anulação, reabertura, importação e exportação. As aprovações de empréstimos/ajustes passam a exigir Administrador independente.
7. Ajustes de consolidação antigos sem organização são bloqueados na aprovação. Rever antes de aprovar; não foi inventada uma imputação histórica.
8. Publicar Worker e migrações de forma coordenada, seguindo o fluxo atual e com recuperação documentada. Após publicação, verificar commit, logs e reconciliações. Esta entrega não publica alterações.

## Funcionalidades que permanecem por implementar ou validar

Estes pontos não podem ser declarados concluídos por esta correção:

- Regras fiscais e laborais reais dos Country Packs, com tabelas, vigências, testes e validação local. Não foi inventada legislação ou cálculo de imposto.
- Integração de produção PayPay, incluindo credenciais do comerciante, assinatura de webhooks e reconciliação. Sandbox permanece separado de pagamentos reais.
- Motor específico de previsão de caixa de 13 semanas e relatórios executivos formatados. Exportação JSON fornece dados de origem e não substitui esses produtos.
- Reconciliação automática de intercompany. Eliminações continuam a depender de ajustamentos documentados.
- Limites de aprovação por valor e segunda aprovação adicional: precisam de política configurada, não de um valor arbitrário.
- Assinaturas formais, geolocalização e outras funcionalidades presentes apenas como campos ou roadmap não foram convertidas em funcionalidades completas.
- A matriz final de acesso executivo por função deve ser aprovada pelo responsável do produto. Foi corrigido o isolamento organizacional nos caminhos identificados; não se declarou uma certificação abrangente de segurança.
- Testes ponta a ponta e verificação da configuração Cloudflare/Supabase do ambiente real continuam necessários antes da aceitação operacional.

## Nota técnica

As migrações manuais são a fonte de verdade dos domínios existentes neste projeto; o schema Drizzle original só cobre parte das tabelas. Novas gerações automáticas de migrations devem comparar esse schema com todas as migrations antes de serem aplicadas. Os tipos gerados foram mantidos como módulo para não substituir os tipos do navegador.
