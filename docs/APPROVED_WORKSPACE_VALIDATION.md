# Reconstrução da interface aprovada — PR #40

## Critério de aceitação

As imagens aprovadas determinam a composição dos componentes reais: módulos no topo, menu lateral com grupos coerentes, título/contexto/ações compactos, tabelas principais e detalhe contextual abaixo da seleção. Os valores das imagens não substituem os dados da plataforma. O produto continua a consumir dados internos, introdução manual e fontes externas; esta revisão não altera os motores de cálculo.

A instrução posterior do utilizador, acompanhada das onze capturas de 21 de outubro, alargou expressamente a reconstrução aos ecrãs abaixo. As capturas são referências de design, não capturas da nova implementação nem aprovação visual desta revisão.

| Referência | Componente real reconstruído |
| --- | --- |
| 155145 / 155359 | Plano de efetivos: estrutura por departamento, movimentos contextuais, custos e versões |
| 155206 | Objetivos e planos de ação: tabelas, seleção e detalhe com os comandos existentes |
| 155248 | Central de mapas: categorias, documentos dos estudos guardados, seleção e abertura direta |
| 155315 | Caixa de tarefas: tabela e detalhe do pedido selecionado, com ligação à origem |
| 155424 | Avaliações: tabela, seleção, pontuações reais, desenvolvimento e formulário contextual |
| 155450 | Demonstração aberta: tabela financeira, contexto, exportação e regresso à origem |
| 155552 | Estudo: pressupostos por secção lateral e separadores de projeções, cenários e avaliação |
| 155606 | Ficha do colaborador: cabeçalho de identidade, separadores e formulário preservado |
| 155704 | Monitorização: execuções e fontes em tabelas, contagens e decisões contextuais |
| 155723 | Utilizadores: tabela, seleção e edição explícita do perfil de acesso |

A folha mensal de salários mantém a reconstrução das imagens anteriores: quatro etapas, barra de ações, tabela e editor contextual. Não existe uma demonstração paralela nem uma segunda interface antiga para editar os mesmos registos.

## Implementação e preservação funcional

- Shell: nomes curtos dos módulos, monograma EP, menu lateral e rodapé legíveis. Em Análise, Mapas e relatórios e Modelos e versões ficam no menu principal. Nos restantes módulos, o acesso transversal aos mapas fica no rodapé. Idioma, pesquisa e alertas continuam disponíveis no menu de ferramentas do cabeçalho; o acesso à página inicial está na marca e nos breadcrumbs.
- Finanças mantém exatamente cinco grupos operacionais: análise, planeamento/orçamento, modelagem, liquidez/financiamento e consolidação. Dados/configurações e relatórios permanecem separados. Permissões e destinos existentes não foram substituídos.
- Ficha: os campos pessoais, documentos, fiscalidade, banco e dados profissionais permanecem no mesmo formulário montado. Mudar entre Identificação, Contrato, Remuneração, Variáveis mensais, Documentos e Histórico não elimina campos nem valores introduzidos. As ligações a empréstimos, retroativos e assiduidade continuam nas opções. O botão do cabeçalho submete o formulário real.
- Estudo: cinco secções de pressupostos, com todos os parâmetros anteriores. Mudar de secção não grava nem altera o modelo. O cabeçalho permite guardar, abrir mapas e aceder aos documentos existentes. As projeções, cenários, cartões de avaliação e metodologia mantêm os mesmos resultados, fórmulas, notas e motores.
- Central: lista documentos de estudos autorizados e abre o identificador e mapa selecionados. Avaliação e indicadores usam os separadores reais 5 e 6 do modelo integrado; o modelo legado conserva a avaliação no separador 4. Excel usa o workbook existente e preserva a indicação de pressupostos atualizados por compatibilidade. Favoritos, pesquisa e todos os destinos anteriores continuam acessíveis.
- Planos: os agregados de departamento usam as linhas reais do período e os totais devolvidos pela API. O detalhe mantém função, período, tipo, quantidade, custo unitário e pressuposto. Ao escolher um plano fora do período corrente, o filtro inicia-se no primeiro mês desse plano. Os comandos de criação, linha, submissão e aprovação mantêm os mesmos payloads e validações.
- Objetivos/ações: tabelas e detalhe, mantendo as escalas de medição, progresso calculado, ciclos, pesos, check-ins, estados, conclusão e evidência. Planos de ação podem ser usados no mesmo espaço de objetivos; não se inventa uma associação a um objetivo que os dados não contenham.
- Avaliações: os controlos de colaborador, gestor e calibrador independente foram mantidos. A classificação/comentário usam o formulário real. A seleção fica protegida durante a edição contextual, evitando enviar um formulário de um registo enquanto se mostra outro.
- Utilizadores: mudar o perfil no editor prepara uma alteração; guardar usa o comando real de mudança de função. Reenvio, cancelamento, remoção e estado de entrega dos convites permanecem disponíveis. A revisão não cria permissões avulsas por módulo que o modelo de autorização não suporte.
- Integrações: todas as fontes, execuções, contagens, estados, hashes e mapeamentos continuam acessíveis. Validar/decidir usam as capacidades e motivos devolvidos pela API, incluindo a segregação de funções.
- Mapas: linhas e notas continuam a vir de `workbookPreview`. Não se inventam ligações ao RH ou comparações sem evidência. Cabeçalhos semânticos, escala monetária, notas, explicações, Excel/PDF/impressão e regresso ao processo foram preservados. Uma chave React duplicada no relatório analítico foi corrigida sem alterar os identificadores do modelo.

## Limites de correspondência com as imagens

A geometria não autoriza preencher dados ausentes ou acrescentar controlos fictícios. A implementação usa o que as APIs fornecem: o estudo atual tem pressupostos agregados, não um cadastro de produtos/serviços; as permissões são atribuídas por perfil, não por uma matriz avulsa de checkboxes; as aprovações da caixa de tarefas executam-se nos respetivos processos; a API de avaliações fornece pontuações e contagens, não o detalhe completo das metas congeladas. Os widgets das imagens que dependem dessas fontes não foram simulados.

Estes pontos devem ser distinguidos da validação do layout. Não há declaração de reprodução integral de todos os controlos presentes nas imagens.

## Verificações

- Tipagem e build verificado.
- Suite de 559 testes; os testes estáticos que exigiam slogans antigos foram atualizados para os novos títulos localizados, mantendo as verificações de APIs e comandos.
- Auditoria dos cinco idiomas: as seis ocorrências preexistentes, sem regressões.
- Componentes React reais em JSDOM: todos os campos da ficha e valores mantidos entre seis separadores; nenhum POST por mudar de separador.
- Estudo: cinco secções reais, resultados inalterados ao navegar, payload de gravação com a revisão original e bloqueios de leitura preservados.
- Central: seleção do estudo e mapa corretos, Excel, favoritos, catálogo anterior e regresso ao identificador de origem.
- Objetivos/avaliações: seleção do alvo correto, ator autorizado para avaliação, formulário e payloads originais.
- Caixa/administração: navegar à origem não decide a tarefa; alteração de perfil só é enviada ao guardar, para o utilizador selecionado.
- Integrações/efetivos: ação de decisão independente continua desativada; seleção de departamento, campos e payload de movimento mantidos.
- Folha/mapas: repetida a verificação anterior com API real e SQLite isolada para gravação/revisão, salário base preservado, variáveis colapsadas, Excel, linhas/notas e regresso ao formulário. A impressão/PDF foi simulada e o conteúdo verificado; não equivale a inspecionar um PDF gerado num navegador.

Os logs e os anfitriões de teste locais não fazem parte do produto nem são uma interface alternativa entregue.

## Pré-visualização e condição de publicação

O workflow deste ramo executa os testes e carrega exclusivamente uma versão com `wrangler versions upload`. Não executa migrações nem ativa produção. O script compara a implantação ativa antes e depois e falha se a distribuição de tráfego mudar. A pré-visualização partilha os recursos e permissões do Worker; não é uma base de dados de teste isolada.

Ligação estável: https://pr-40-enterprise-performance-platform.pascoalfredy.workers.dev

O PR permanece em rascunho. Antes de fazer merge/publicar, falta comparar a versão reconstruída no navegador com as referências e validar os downloads reais de Excel/PDF, impressão e regresso à origem. O navegador deste ambiente restringiu a continuação após a entrega nativa de credenciais; não foi contornada essa restrição. Os testes DOM não substituem a comparação visual exigida pelo utilizador.
