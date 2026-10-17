# Painéis executivos — Finanças e RH

Pedido de 17/10/2026: usar os 16 modelos enviados como referência de leitura executiva e disponibilizar PDF para reuniões. Implementação com identidade própria (azul/verde), sem reproduzir logótipos ou certificações do fornecedor de referência.

## Acesso e fontes

- Finanças → Cockpit CFO → Saúde financeira: painel financeiro completo quando existem posições e movimentos suficientes; análise exploratória com categorias e ligação à referência/origem do movimento.
- Com apenas receitas/custos, a vista apresenta resultado gerencial e ponte por categoria. Não inventa balanço, ROIC ou fluxos operacionais a partir de um extrato.
- RH Dashboard → Indicadores de gestão: painel executivo, histórico, ponte de efetivo, custos e horas, avaliações, vagas e contratos; simulação mensal.
- Filtros de empresa, período e moeda existentes mantêm-se; Finanças permite mês/acumulado e período de comparação. Consultas e históricos respeitam o âmbito do utilizador e moeda. Orçamento usa apenas a versão aprovada mais recente do ano, na mesma organização e moeda.

## Modelos e indicadores

| Referência | Implementação |
| --- | --- |
| Menu / cockpit | Cartões com valor, comparação, fórmula e leitura; navegação por tema |
| Estrutura de capital | Autonomia, passivo/capital, solvabilidade, passivo/ativo, peso de passivo não corrente, liquidez geral/reduzida/imediata |
| ROIC | NOPAT por taxa assumida / capital investido médio; anualização identificada |
| DuPont e expandido | Margem × rotação × multiplicador; decomposição operacional, financeira e fiscal |
| Ponte de resultados | Variações de receita, custo das vendas, OPEX, depreciação, juros e imposto reconciliadas com o resultado |
| Análise exploratória | Categoria → movimentos e referência de origem; não há hierarquia de contas se não existir na fonte |
| Outros indicadores | Margens bruta/EBITDA/líquida, ROA, ROE, dívida líquida, cobertura de juros e dívida/EBITDA |
| Fluxos de caixa | Ponte saldo inicial → atividades → saldo final, tendência mensal, conversão e caixa livre definida |
| Ciclo de tesouraria | DSO/DIO/DPO e ciclo; DPO usa COGS como proxy de compras e saldos finais |
| EVA | Árvore EBIT → NOPAT − custo do capital do período; ROIC − WACC |
| What-if financeiro | Vendas, custo unitário, OPEX fixo, depreciação, juros e taxa fiscal explícita |
| DCF empresa | FCFF, terminal com WACC > g, EV, dívida líquida e equity; sensibilidade WACC × g e alerta de reinvestimento |
| Orçamento | Real vs orçamento aprovado, desvios e evolução das receitas; ausência de versão/cobertura indicada |
| Comparação setorial / PME / Top 5% | Referências manuais com fonte/setor/ano obrigatórios, para quatro rácios; **não certifica** estatutos nem instala bases setoriais externas |
| RH equivalente | Efetivo, admissões, saídas, rotatividade, custo e custo por pessoa, horas, avaliação média, vagas/contratos, histórico e simulação |
| PDF de reunião | Documento completo com todos os separadores, gráficos, premissas, origem, âmbito, data e notas; usa Guardar como PDF do navegador |

## Convenções relevantes

- Moeda em unidades menores no motor; percentagens e rácios sem arredondamento intermédio. Valores exibidos localizados.
- ROE/ROA/ROIC/rotação anualizam fluxos por 365 / dias observados e usam médias de abertura/fecho. Uma anualização parcial não é previsão.
- Capital investido: média de capital próprio + dívida financeira − caixa. EVA exige capital positivo, WACC e taxa fiscal válidos; rácios de base nula/negativa não são fabricados.
- O What-if trata COGS como variável e OPEX como fixo. Não separa preço/volume/mix sem essa informação na fonte. Imposto de simulação é explícito.
- DCF da empresa é distinto do estudo de viabilidade por projeto já existente. CAPEX/crescimento/perpetuidade são premissas introduzidas pelo gestor, não inferências ocultas. Configurações de simulação são transitórias nesta versão e constam do PDF; não são gravadas no estudo do projeto.
- Sem payroll fechado, custo histórico é indisponível, não zero. A diferença de horas não equivale a absentismo injustificado. Estrutura/vagas atuais não são apresentadas como fotografia histórica.
- Contratos incluem o último dia; ajuste de fronteira mantém a ponte de efetivo reconciliada quando uma saída ocorre no dia de fecho.
- Não calcula VAB por pessoa sem consumos intermédios e efetivo médio adequados, nem atribui scoring oficial/certificações sem regras e fontes autorizadas.
- PDF contém todas as secções e notas mesmo quando os separadores não foram abertos. Nenhuma alteração aos dados/contratos/payroll decorre das simulações.

## Fontes de método

- Damodaran / NYU Stern: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/invfables/eva.htm
- Damodaran / NYU Stern: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/eva.html
- CIPD: https://www.cipd.org/en/knowledge/factsheets/turnover-retention-factsheet/
- CIPD: https://prod.cipd.org/en/knowledge/factsheets/absence-factsheet/

## Verificação e continuação

Testes independentes cobrem DuPont/ROIC/EVA, reconciliação das pontes, DCF constante (EV = FCFF/WACC), casos não calculáveis, simulação financeira e de pessoas, histórico sem payroll, orçamento e âmbito por organização. Renderização de servidor verifica relatórios completos ocultos sem NaN/Infinity e notas antes de abrir separadores. Testes de exportação existentes mantêm-se. Falta inspeção visual no navegador autenticado e validação do aspeto final da impressão; não foi alegado teste visual em produção.

Pendências que dependem de fontes: importação de posições/hierarquias ERP necessárias aos indicadores avançados, referências setoriais verificadas/licenciadas e regras oficiais locais de scoring. Não se alterou o importador para simular que fontes incompletas contêm esses elementos.
