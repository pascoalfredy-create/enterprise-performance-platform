# Orçamento, pressupostos operacionais e modelagem financeira

## Papéis e dados preservados

- **Planeamento e orçamento**: compromisso anual por rubrica, mês, empresa e dimensão; aprovação, revisões e análise de execução continuam no motor orçamental existente.
- **Pressupostos operacionais mensais**: novo nome público do antigo «Plano de negócios mensal». Conserva IDs, versões, aprovações, drivers e API `financial_models`. É uma fonte operacional subordinada ao planeamento, não um segundo estudo de viabilidade.
- **Modelagem financeira**: estudos `feasibility_studies`, cenários, dívida, aportes, demonstrações integradas e avaliação do projeto. Investimento/depreciação e IVA aparecem nas secções Investimento e Fiscalidade; financiamento mantém dívida, aportes e parâmetros de avaliação. Não foram alteradas fórmulas nem revisões guardadas.
- A navegação mantém as cinco áreas financeiras aprovadas. `Modelação` é um identificador interno legado, preservado para compatibilidade; não é uma segunda entrada pública de Modelagem financeira.

## Ponte explícita de reconciliação

No mapa anual, um detalhe recolhível compara uma componente do primeiro ano operacional de um estudo guardado com a rubrica analítica selecionada. O utilizador escolhe estudo/revisão atual, mês civil de início e componente. O cálculo reutiliza `buildPlanningModel`; não existe um motor financeiro paralelo.

- Mesma empresa e moeda; sem conversão cambial implícita.
- Apenas «Sem dimensão»: os estudos não contêm evidência para repartir por centro de custo.
- Rubrica de Receita, Custo ou Ativo/Investimento conforme a componente, sem adivinhar códigos contabilísticos.
- Meses 1–12 comparados por calendário. Ausência/fora da cobertura é `null`/«—», não zero.
- CAPEX do mês zero exposto separadamente, no mês anterior ao primeiro mês operacional; nunca repetido como investimento do ano 1.
- Valores da rubrica respeitam a mesma precedência de pressupostos/ajustes mostrada no mapa. Edições pendentes suspendem a comparação até serem guardadas.
- Revisão do estudo apresentada explicitamente. Comparação de leitura da revisão atual, **não** vínculo persistido nem evidência histórica congelada na aprovação.
- Não grava, não aprova e não substitui orçamento, fontes RH ou ligações de investimento existentes. Os controlos e snapshots aprovados permanecem no servidor.

A transferência automática de todo o ano 1 do estudo, com mapeamentos persistidos, políticas de atualização, repartição por centros e evidência congelada por aprovação, é uma etapa distinta. Esta entrega não a simula nem afirma que já existe. Os investimentos do plano operacional mensal aprovado continuam a usar a integração comum já entregue.

## Tabelas de depreciação de Angola

Referência: Decreto Presidencial n.º 207/15, de 5 de Novembro; anexo, tabelas A–N (D desdobrada em DA–DN). Fonte primária: https://files.lex.ao/presidente-da-republica/2015/decreto-presidencial-n-o-207-15-de-05-de-novembro/download/decreto-presidencial-n-o-207-15-de-05-de-novembro_presidente-da-republica_lex-ao.pdf

477 entradas numéricas: 81 gerais G existentes e 396 das outras tabelas; 27 tabelas selecionáveis. As descrições legais permanecem em português, identificadas como tal nos cinco idiomas. A taxa é a percentagem publicada, não `100 / vida arredondada`. A escolha é explícita por setor/categoria/bem; nenhuma revisão antiga recebe uma taxa automaticamente. A referência exportada identifica a tabela efetivamente escolhida, incluindo importação de pressupostos Excel.

A tabela setorial tem precedência sobre a geral (artigo 6). Condições, exclusões, regimes especiais e elegibilidade fiscal devem ser consultados no diploma original. Esta versão é uma referência de previsão de gestão de 2015; não certifica dedutibilidade, atualidade legislativa em 2026 nem cobertura de regimes especiais petrolíferos/mineiros. Não se presume que terrenos ou intangíveis de duração indefinida sejam depreciáveis.

### Anomalias da publicação conservadas, não corrigidas por suposição

| Tabela/código | Publicação | Tratamento |
|---|---|---|
| B 4.1 | 3,33% e 3 anos | Taxa e vida preservadas; aplicação automática bloqueada |
| F 1, duas linhas | 12,5%/8 anos e 14,28%/7 anos | Código original repetido preservado, IDs distintos; aplicação automática bloqueada |
| J 1.19 | 6,66%; vida «1,20» | Texto preservado, vida numérica indisponível; aplicação automática bloqueada |
| M 3.5 | 4% e 50 anos | Taxa e vida preservadas; aplicação automática bloqueada |

Entradas assinaladas são consultáveis. Uma previsão manual continua possível sem alegar uma referência fiscal validada. O servidor rejeita atribuir essas referências a estudos; o importador não as repõe como referências validadas. A taxa continua a aplicar-se ao conjunto dos investimentos do estudo: não foi introduzida uma falsa classificação individual de ativos.
