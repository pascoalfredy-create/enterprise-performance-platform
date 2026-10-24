# Auditoria aprofundada — Administração e Integrações

Data: 24/10/2026. Auditoria de processos, contratos de dados e controlos do código.

## Âmbito e limites

Código inspecionado: `024a26ca85fce09bfbd8eb605bf973f020ab4619`, ramo de revisão do PR50. Main confirmado no GitHub: `dbd89a51dd57bef559fe7a311ed79b7b750e0386`. Não confundir comportamento do código em revisão com validação visual da produção. Nenhuma alteração funcional, operação em dados reais ou publicação foi realizada. Não constitui teste de intrusão nem certificação de segurança.

Foram inspecionados routing/autorização, setup/convites/utilizadores/dimensões, fontes/execuções/mapeamentos, migrações, aprovação, ativação, notificações e consumidores analíticos. Os cenários adicionais usaram SQLite em memória, todas as migrações reais e o handler real de integrações. O adaptador reproduz batch transacional; não simula concorrência de Cloudflare D1.

## Resultado

12 achados: 8 prioritários (P1) e 4 melhorias de processo (P2). P1 significa corrigir antes de apresentar o centro como integração operacional completa; não significa vulnerabilidade crítica demonstrada em produção.

### ADM-01 — Leitura administrativa sem permissão específica (P1)

Evidência: `worker/index.ts`, routing em torno de 6452, `setupSnapshot` e `setupApi`. `/api/setup` exige `setup:write` somente para escritas; a consulta exige autenticação, membership e módulo CORE, mas não uma permissão administrativa de leitura. Snapshot agrega utilizadores/e-mails/perfis, colaboradores, dimensões e, no âmbito global, últimos eventos. O filtro organizacional existe; não foi demonstrado acesso entre tenants.

Impacto: um utilizador com CORE pode receber mais dados do que necessita para selecionar organizações ou rubricas. Não confundir visibilidade do menu com autorização da API.

Correção: separar consulta de referência de consulta administrativa; definir permissões por recurso e minimizar resposta. Testar Administrador, Financeiro, RH, Gestor, Leitura e Colaborador, com e sem âmbito e módulos.

### ADM-02 — Operação e evidência de auditoria não atómicas (P1)

Evidência: `setupApi` aplica alterações e só depois grava `audit_events` (2429–2465). Convites também incluem envio externo entre estes passos.

Impacto: erro posterior pode ser apresentado como falha de gravação embora uma criação ou alteração já tenha acontecido. Repetir pode produzir conflito e dificultar diagnóstico.

Correção: agrupar mutação local, auditoria e intenção de envio numa transação; enviar e-mail por outbox com estado e repetição idempotente. Não tentar incluir serviço de e-mail numa transação de base de dados. Falha administrativa analisada estaticamente; não executada contra handler de produção.

### ADM-03 — Estado do convite mistura preparação e entrega (P2)

Evidência: criação/reenvio grava `Convite enviado` antes de `sendInvitationEmail`; resposta distingue accepted/not_configured/failure e resumo de auditoria regista resultado, mas estado do utilizador continua igual.

Impacto: lista pode sugerir envio bem-sucedido quando não houve envio; aceite pelo fornecedor também não prova entrega na caixa de entrada.

Correção: manter estados separados para associação, token e entrega: preparado, por enviar, aceite pelo fornecedor, falhou, aceite pelo destinatário. Não chamar entregue sem evidência do fornecedor.

### ADM-04 — Administração como permissão única e validação desigual (P1)

Evidência: `/api/setup` reúne unidades, acessos, colaborador, dimensões e catálogo sob `setup:write`. Criação de utilizador usa `body.role || Gestor`; alteração valida enumeração explicitamente. Administrador com organização é promovido a âmbito global pelo securityContext (1430ff), por desenho existente.

Impacto: delegação pouco granular e perfil inválido pode gerar associação sem permissões; atribuir Administrador nunca deve ser interpretado como administrador limitado a filial. Não foi demonstrada elevação por utilizador sem setup:write.

Correção: validar perfis na criação e alteração, explicar âmbito global, separar permissões organizacionais, acessos e catálogo. Confirmar política de último administrador com atualização concorrente antes de a considerar garantida: verificação COUNT e alteração são passos separados.

### ADM-05 — Percurso de configuração mede presença, não prontidão (P2)

Evidência: `app/page.tsx` progresso de configuração usa existência de organizações/utilizadores/colaboradores, apesar de a etapa de colaboradores estar corretamente oculta na Administração e disponível no RH. `worker/customer-activation.ts:113` marca Integração validada quando existe qualquer execução, independentemente do estado.

Correção: configurar estrutura não deve depender de cadastrar colaborador numa empresa que ainda está só a usar finanças. Avaliar prontidão por finalidade e critérios reais; integração só concluída quando validada/aplicada conforme contrato. Não reintroduzir cadastro duplicado: a separação visual RH/Administração já existe.

### INT-01 — Aprovação de contagens não equivale a dados aplicados (P1)

Evidência: `worker/integrations.ts` recebe source/org/chave/quantidade; valida aceites+rejeitados e aprova estado. Não recebe ficheiro/linhas, não executa SFTP/API e não publica dados no motor financeiro. Tipo de conector é metadado. UI `app/integrations-workspace.tsx` chama Nova execução e Conectores configurados.

Impacto: gestão pode considerar integrada uma execução que apenas tem contagens declaradas. Importadores financeiros específicos e pontes internas existem e devem ser reutilizados, não substituídos.

Correção: distinguir fonte registada de conector operacional; ligar cada execução a documento/lote real, validação, aplicação e destino. Estados sugeridos: recebido, em validação, com pendências, pronto para aplicar, aplicado, falhou. Aprovação humana apenas onde necessária.

### INT-02 — Idempotência aceita conteúdo divergente (P1, reproduzido)

Evidência: receiveRun consulta só tenant + idempotency_key e devolve sucesso idempotente antes de comparar origem, organização e quantidade. input_hash não é comparado; representa metadados, não conteúdo de ficheiro.

Experiência: primeira execução organização a/10 registos = 201; mesma chave organização b/99 registos = 200, idempotent true.

Correção: guardar identidade e hash canónico do conteúdo/parâmetros; mesma chave+mesmo pedido devolve resultado original; mesma chave+pedido diferente devolve 409. No âmbito limitado, nunca confirmar implicitamente execução fora do âmbito. Testar concorrência e regra de unicidade.

### INT-03 — Falha de auditoria deixa transição confirmada (P1, reproduzido)

Evidência: validateRun/decideRun atualizam a execução e gravam audit_events separadamente.

Experiência: trigger de falha na auditoria de validação => HTTP500, mas estado persiste Validada. Isto confirma inconsistência entre resposta, estado e evidência.

Correção: transição condicional e auditoria na mesma transação/batch. Aceitação: falha de auditoria mantém estado anterior; repetição segura e conflito explícito.

### INT-04 — Fonte suspensa aceita nova execução (P1, reproduzido)

Evidência: formulário filtra Ativa; receiveRun não verifica status/direção. Trigger garante tenant e referência, não atividade.

Experiência: fonte alterada para Suspensa em memória; nova chave recebida com HTTP201.

Correção: verificar atividade, direção e organização ativa no servidor. Definir política para execuções já recebidas antes da suspensão. Testar chamadas diretas, não apenas botão desativado.

### INT-05 — Recuperação e reconciliação insuficientes (P2)

Evidência: estados Recebida/Validada/Aprovada/Rejeitada; após rejeição não existe correção/reprocessamento ligado à execução original; apenas contagens aceites/rejeitadas, sem motivo por registo. Número sequencial usa MAX+1, protegido por unicidade mas sujeito a conflito concorrente.

Correção: disponibilizar pendências por linha em importadores reais, gerar nova revisão ligada à anterior, reutilizar mapeamentos, preservar original e estados finais. Identificar erro técnico versus regra de negócio. Repetir números/execuções com controlo transacional e resposta de conflito, não prometer exatamente-uma-vez só pela chave.

### INT-06 — Centro não unifica proveniência nem contexto (P2)

Evidência: aba Mappings resume apenas financial_source_mappings; automatização financeira tem outro catálogo; integrações de estudos/RH/orçamento possuem contratos próprios. Notificações navegam para string Integrações sem execução selecionada. Snapshot lista no máximo 100 execuções sem paginação explícita; métricas da UI usam a lista limitada. Fontes e contagens globais não seguem filtro de organização das execuções.

Correção: uma porta Importar de outros sistemas, com destino/origem/período; conservar motores específicos. Monitorização com processo/execução selecionados, cobertura, revisão, origem, destino, aplicado/pendente e acesso autorizado. Mostrar recorte das métricas e paginação; definir quais metadados de fontes são globais e adequados a cada perfil. Não somar ERP e payroll para o mesmo custo económico.

## Controlos existentes a preservar

Autenticação verificada no servidor; membership e âmbito tenant; guardas de módulos/permissões; bloqueio de escrita de setup para âmbito organizacional; tokens de convite com hash, validade, uso único e identidade; revogação no reenvio; recusa de auto-remoção e proteção sequencial do último administrador; triggers de referência tenant e contagens; estados de integração; decisão por utilizador diferente do validador. Leitura está bloqueada na API externa de escrita. Não eliminar estes controlos para simplificar UX.

A aprovação atual separa validador de decisor, mas não exige que criador seja diferente do decisor. Definir essa política conscientemente conforme risco; não declarar automaticamente que três intervenientes são obrigatórios.

## Processo alvo e informação visual

Administração: configurar unidade → atribuir acesso e âmbito → confirmar convite → verificar prontidão. Cadastro e vínculo do colaborador permanecem no RH. Dimensões financeiras podem ser referenciadas por vários módulos com único cadastro e dono claro.

Importação: escolher origem/destino → carregar documento ou executar conector real → identificar empresa/período/moeda/base → validar/mapeamentos → resolver pendências → confirmar aplicação → consultar resultado no módulo/BI. Mostrar só contexto, estado, tarefa principal e pendências; detalhes técnicos em expansão. Relatório mantém evidência completa.

Nome de interface aprovado: Importar de outros sistemas. ERP pode permanecer termo técnico e classificação de origem. Registar fonte API não significa que exista autenticação, credencial, sincronização ou conexão operacional.

## Sequência recomendada

1. Corrigir atomicidade e idempotência; validar atividade/direção e perfis; fechar contrato de leitura administrativa.
2. Definir fronteiras e estados: associação/entrega, metadado/conector, recebido/aplicado; não inventar automatismos.
3. Ligar centro aos importadores reais e às pontes internas; encaminhar para execução exata e manter contexto.
4. Simplificar ecrãs, remover indicadores repetidos e corrigir prontidão/paginação.
5. Validar matriz de perfis e jornadas reais no navegador antes da publicação.

## Validação realizada

142 testes existentes passaram: security-policy, financial-ledger e openapi-contract (log local outputs/admin-integration-tests.log). Muitos testes de política são asserções estáticas; não equivalem a testes end-to-end de autorização. Três experiências adicionais do handler real reproduziram INT-02/03/04, com base de dados isolada e falha injetada de auditoria. Script outputs/admin-integration-probes.mjs. Nenhum teste usou credenciais ou dados da empresa.

Não foi executada comparação visual autenticada, concorrência D1, entrega de e-mail, ligação SFTP/API real, pentest ou validação de todos os importadores. Não foram repetidos build/tipagem porque não houve alteração de código executável. Estes limites impedem declarar a plataforma integralmente validada.
