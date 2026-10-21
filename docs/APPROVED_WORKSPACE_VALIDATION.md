# Folha salarial e mapa financeiro — validação da apresentação

Estado: entrega em revisão. Não aprovada para merge ou publicação.

## Âmbito

A base é `85ca0298a7af321a4cd8638c1a307c5a4a20d277`, posterior ao PR #37. São preservadas as correções dos PRs #38 e #39. Não há alterações aos motores de cálculo, à base de dados, às migrações ou à configuração de produção.

A folha mensal usa uma barra de contexto, quatro etapas, uma barra de ações e a tabela operacional existente. A seleção abre o editor contextual; os restantes valores, rubricas, quantidades, taxas e notas ficam no mesmo formulário, dentro de uma secção expansível. A ficha e o detalhe do cálculo continuam disponíveis após o processamento. A dedução genérica não é apresentada como faltas, pois não existe uma correspondência que permita fazê-lo com rigor.

O mapa aberto mantém a navegação da plataforma, identifica o estudo e a demonstração, permite selecionar os mapas suportados, alterar a escala monetária, exportar e regressar à origem. Linhas, fórmulas, notas e explicações continuam a vir do motor existente. A escala afeta apenas a apresentação; não altera os valores exportados nem as métricas sem esse controlo.

Finanças mantém cinco áreas operacionais. Mapas e relatórios e dados/configurações permanecem separados. O padrão visual não foi estendido às páginas internas dos restantes módulos: depende primeiro da comparação visual desta entrega.

## Verificação executada

- `npm run typecheck`: passou.
- `npm test`: build e 556 testes passaram, sem falhas.
- `npm run i18n:audit`: passou, com as seis ocorrências da baseline existente e sem regressões.
- `git diff --check`: passou.
- Verificação adicional com componentes React reais montados em JSDOM: edição de valor localizado, formulário sem nomes duplicados, gravação pelo código real da API com SQLite isolada e todas as migrações formais, recarregamento da revisão e manutenção do salário base.
- Exportação Excel da folha e abertura/regresso do relatório, mantendo o formulário de origem montado.
- Comparação de todas as linhas e notas dos mapas renderizados com `workbookPreview`, incluindo as explicações dos indicadores. Dados exclusivamente sintéticos de teste, sem substituir dados da plataforma.
- Mudança de escala monetária e manutenção das métricas quando o seletor de escala não existe.
- Geração e leitura do Excel; expansão das notas para impressão e reposição após `afterprint`; envio do mapa completo ao mecanismo PDF existente. A chamada de impressão foi simulada no teste DOM: não equivale à inspeção de um PDF produzido num navegador real.

## Bloqueio e critérios pendentes

O navegador disponível não alcançou o servidor local. A abertura de ficheiros locais foi expressamente bloqueada pela política de segurança do navegador. Não foram contornadas essas restrições.

Ainda são obrigatórios antes de publicar:

1. Abrir este ramo num ambiente de revisão acessível ao navegador, com autenticação de teste autorizada.
2. Comparar capturas reais da folha e do mapa com os mockups aprovados, incluindo alinhamento, densidade, tipografia, estados e comportamento responsivo.
3. Repetir edição/gravação, importação, exportação Excel/PDF, impressão e regresso ao mesmo estudo nesse ambiente.
4. Verificar o ciclo salarial com os perfis autorizados de RH e Administração, incluindo os impedimentos de segregação de funções.
5. Só então aprovar os componentes visuais, propagá-los aos restantes módulos e autorizar a publicação.

Não existe declaração de fidelidade visual baseada apenas nos testes automatizados. Este PR deve permanecer em rascunho enquanto os critérios pendentes não forem cumpridos.

## Pré-visualização do PR #40

O workflow de verificação deste PR prepara uma configuração do build e executa exclusivamente `wrangler versions upload`, depois dos testes. Não executa migrações nem `wrangler deploy`/`versions deploy`. O script verifica a identidade do PR e os bindings esperados, consulta a implantação ativa antes e depois e falha se houver alteração na distribuição de tráfego. A ligação devolvida pela Cloudflare fica no resumo da execução do GitHub Actions.

Esta ligação de versão partilha os recursos e permissões configurados no Worker. Não é uma base de dados de teste isolada. As verificações de gravação descritas acima continuam a referir-se à SQLite local isolada. Uma eventual validação funcional no navegador deve usar apenas dados de teste autorizados.

## Primeira comparação num navegador autenticado

A versão Cloudflare `48365bef` abriu no navegador e o início de sessão foi confirmado pela presença da empresa e dos módulos autorizados. Foram capturadas a folha mensal e uma DRE projetada real. Na Unidade Demonstração foi criado e guardado o estudo sintético `Validação visual PR 40` (revisão 1), e a abertura das demonstrações foi confirmada com os resultados calculados dos pressupostos de teste.

A comparação revelou três problemas visuais: regras da antiga shell escondiam a marca e deslocavam o cabeçalho; a lista de operações duplicava a navegação acima da folha; nomes e justificações de estado alargavam as linhas. Esta revisão isola a shell antiga, mantém as operações em grupos nativos expansíveis na barra lateral e permite abrir os detalhes dos estados na própria célula. O editor continua a usar o mesmo formulário e todos os campos. O mapa passa a abrir no topo e a repor a posição de trabalho ao fechar.

O navegador restringiu a continuação após a entrega nativa de credenciais. Não foi possível testar o download no navegador nem obter capturas posteriores a estas correções. A comparação visual final e a verificação manual de Excel/PDF continuam pendentes; as verificações DOM e API isolada não são apresentadas como equivalentes.

## Capturas fornecidas pelo utilizador — 21 de outubro

Foram inspecionadas três capturas: ficha do colaborador, formulário de cadastro e parte inferior da folha mensal com o editor contextual. A captura da folha confirma a separação das colunas, os estados compactos e o acesso às rubricas adicionais. Não inclui o cabeçalho ou o mapa financeiro, pelo que não permite concluir a comparação desses elementos.

As capturas revelaram que o rodapé da navegação ainda herdava o fundo azul e o arredondamento de `module-nav.css`, tornando as letras escuras pouco legíveis. A regra existente do rodapé aprovado passa a definir explicitamente fundo transparente, cor, borda e espaçamento; não foram acrescentados `!important` nem alteradas ações ou permissões. A ficha e o cadastro continuam a precisar da aplicação posterior dos componentes validados, conforme o âmbito sequencial desta entrega.

Um segundo conjunto de cinco capturas inclui o cabeçalho e as quatro etapas da folha, o editor contextual e a DRE projetada do estudo de validação. A DRE apresenta os anos 0–5, as rubricas, os subtotais, o resultado líquido e os comandos Excel/PDF/impressão. A imagem não comprova o conteúdo exportado ou as notas fora do enquadramento. As restantes vistas são Actual/Budget e cash-flow de um plano; não substituem a verificação das demonstrações do estudo.

O cabeçalho revelou o seletor “Mais módulos” cortado pela largura fixa de 85 px e os botões centrados pela regra antiga de `.topo nav`. Os controlos da barra aprovada passam a ter largura intrínseca, alinhamento à esquerda e altura própria; a barra permite deslocação horizontal em espaço reduzido, mantendo todos os destinos. Continua pendente confirmar visualmente esta última correção e o rodapé, bem como editar/gravar, descarregar Excel/PDF e regressar à origem no navegador.
