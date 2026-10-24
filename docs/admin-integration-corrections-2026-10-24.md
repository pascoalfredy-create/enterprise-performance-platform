# Administração e Integrações — primeira correção executável

Implementado em 24/10/2026, sobre PR50. Ainda não publicado em produção.

## Alterações

- Handler de integração bloqueia escrita por perfil de consulta mesmo quando chamado diretamente.
- Chaves idempotentes só reutilizam uma execução com a mesma fonte, organização e contagem; conflito devolve 409 e não altera dados.
- Rejeita nova receção de fonte suspensa, fonte apenas de saída, organização inativa ou âmbito explícito divergente.
- Validação e decisão usam batch transacional com auditoria condicional; falha da auditoria reverte a transição. Mantém decisão independente do validador.
- Contagem de execuções por fonte respeita organização autorizada.
- Snapshot de setup só devolve diretório de utilizadores e auditoria a quem tem setup:write. Colaboradores só são devolvidos a Administração, RH ou Payroll; referências organizacionais/financeiras continuam disponíveis.
- Criação de acesso valida os mesmos perfis da alteração. Novo convite fica preparado, aguardando aceitação; não declara entrega de e-mail.
- Configuração administrativa deixa de depender de cadastro de colaborador para progresso. Cadastro permanece no RH.
- Ativação exige execução aprovada em vez de qualquer execução e usa nome que descreve contagens.
- Centro usa Importar de outros sistemas, Registar receção e Registar fonte. Explica a diferença entre contagem aprovada, conector registado e dados aplicados. Entrada no importador financeiro depende de módulo e permissão de escrita; mantém o importador existente.
- Lista explicita limite de 100 execuções e âmbito dos totais. Novas orientações disponíveis nos cinco idiomas.

## Limites e próxima etapa

Não foi criado conector API/SFTP fictício, nem ligação automática entre contagem registada e importação. Ainda falta unificar monitorização dos importadores reais, paginação completa, recuperação por revisão e navegação com contexto de execução. Atomicidade completa de setup/convites requer refatoração com outbox; não foi declarada resolvida. Proteção concorrente do último administrador precisa de teste D1 e guarda transacional adicional. Os restantes achados BPM permanecem em aberto.

## Regressões

`tests/integrations-control.test.mjs`: cinco cenários com handler real e todas as migrações SQLite, incluindo falha injetada, repetição divergente, fonte suspensa/saída, organização inativa, âmbito e aprovação independente.

`tests/setup-visibility.test.mjs`: dois cenários de matriz de visibilidade. Os testes de política não substituem jornadas de navegador autenticadas.

O PR deve permanecer em revisão até comparação visual e funcional. Não confundir tipagem/build/testes com aprovação visual.
