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
