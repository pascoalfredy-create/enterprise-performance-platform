# C21 — Diagnóstico Financeiro & Investment Intelligence

## Objetivo

Transformar Actual governado em avaliação financeira explicável e transformar cash-flows de investimento em VPL, TIR, payback e sensibilidade determinísticos.

## Diagnóstico

- As linhas do catálogo recebem papéis semânticos configuráveis, sem plano de contas hardcoded.
- O framework escolhe métricas, pesos e intervalos de classificação.
- A ativação exige pesos exatamente iguais a 100%, regras completas e maker-checker.
- O motor calcula liquidez geral, reduzida e imediata, solvabilidade, autonomia, endividamento, margem, ROA, ROE, rotação dos ativos, fundo de maneio, necessidade de fundo de maneio e tesouraria líquida.
- Cada resultado conserva valor, escala, fórmula, score, severidade, recomendação e hash dos inputs.

## Investimento

- Casos versionados por organização e moeda.
- Taxa de desconto em basis points e cash-flows em unidades monetárias mínimas.
- VPL por desconto fixed-point, TIR por pesquisa binária determinística, payback e cinco sensibilidades de taxa.
- A TIR exige fluxo convencional para evitar múltiplas soluções ambíguas.
- Workflow `Rascunho → Calculado → Aprovado`, com aprovador independente do criador e calculador.

IA não calcula, classifica nem aprova. Poderá futuramente explicar resultados já produzidos pelo motor determinístico.
