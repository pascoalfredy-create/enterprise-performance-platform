# Feasibility review and continuation checkpoint

Date: 2026-10-16. Scope: project valuation formula audit, explicit activity units/periods, and decimal/thousands input formatting. The repository is Enterprise Performance Platform; this work does not involve YelaPay or YelaCore ERP.

## Implemented

- Correct negative opening working capital: suppliers' trade credit is not cash already received before the activity starts. Opening financing reserves positive first-year working capital only. Negative operating working capital is recognised in year-one cash flow and settled at project closure. Positive-working-capital cases keep the existing annual end-of-year change convention.
- Explicit monthly/yearly period for entered quantities and fixed costs. Monthly data is multiplied by 12 once; unit prices, unit variable cost, growth, discount and tax assumptions remain annual/per-unit as labelled. Legacy studies without a period remain annual. Saved inputs are not silently rewritten.
- NPV includes cash flow zero undiscounted and future flows at year end. IRR is an annual percentage derived from the same cash-flow vector. Genuine high IRRs are flagged for assumption review, not capped. Nonconventional cash-flow sequences keep IRR unavailable.
- Cumulative depreciation allocation reconciles the depreciable amount exactly to cents, including very small investments spread across many years. Operating break-even includes depreciation; cash break-even excludes it.
- First-year quantity × price cross-check, annual operating cost, high-growth / missing-cost / supplier-credit / high-return review flags, and cash-flow chart.
- Shared localized numeric input: live thousands grouping, decimal entry, paste handling, canonical ungrouped numeric form values, and existing-value formatting. Applied to feasibility, manual income/cost inputs, treasury amount corrections/forecasts and financial operation amounts. Unit prices and quantities can retain four decimal places; aggregate money uses two.
- API accepts the optional explicit period, rejects unsupported assumptions/periods and validates currency.

## References inspected

User-provided excerpt of *Análise Financeira de Empresas*, Queirós et al., 2020: PDF has 36 pages, not the complete book. The annual financial-plan discussion on PDF page 9 (printed page 32), and working-capital discussion around PDF pages 12–13 support distinguishing turnover, balances, payment terms and liquidity. Do not claim this excerpt provides a complete investment-valuation model or that the platform is certified by the authors. No pages or text from the private upload are committed.

Microsoft official NPV / IRR reference used to verify timing and annual periodicity:
- https://support.microsoft.com/en-us/excel/functions/npv-function
- https://support.microsoft.com/en-us/excel/functions/irr-function

The model remains a simplified unlevered project model: operating taxes on positive EBIT, no tax-loss carryforward, financing instalments, VAT, reinvestments or terminal perpetuity. Working-capital payables use variable cost as a proxy; a full purchases/inventory schedule is not implemented. Its annual year-end convention approximates intrayear timing. Those limits must remain visible; never lower an output just because it looks large.

## Validation and next steps

Targeted engine, numeric-format and API tests passed (16 tests). TypeScript passed. Full production build and all 316 tests passed locally. The localisation audit remains at the prior 5 known static-analysis false positives. Record CI and deployment status in the PR. New benchmarks include [-1000, 600, 600] => NPV at 10% = 41.32 and IRR ≈ 13.06623863%; monthly and equivalent annual inputs have identical flows; negative WC is not financing at t0; valid IRR over 100% remains visible; depreciation never becomes negative due to cent rounding.

Before publishing: inspect final full-suite output; browser interaction verification was attempted but blocked because the Playwright browser executable is absent (only the Playwright library is installed); commit only the reviewed files; create a PR and wait for CI; merge under the standing authorization; confirm database/deploy workflow success. If the automatic deployment does not start, the previously successful retry is a same-tree child commit on main with an expected-head guarded ref update. Do not rerun an older deployment that would ship an older commit.

Authenticated visual validation on the user's tenant and their exact saved high-return study has not been performed. No password/authenticator code should be requested in chat. A real high-return study must be reconciled against its quantities, unit prices, expense completeness and monthly/yearly basis; a formula fix alone cannot prove those business assumptions are correct.

## Continuação — 16 outubro 2026

PR #16 integrada e publicada (main 1a2889bda349e32e5e31d6c19bacd0132e0fdba4; deployment 38883307809). Nesta continuação, os paybacks passam de anos decimais para anos e meses arredondados ao mês mais próximo, preservando o cálculo e a coluna decimal no Excel. Exemplos: 1,62 anos → 1 ano e 7 meses; 1,90 → 1 ano e 11 meses. O campo residual inclui definição, exemplo líquido de custos/impostos e orientação para usar zero sem recuperação prevista. Não altera premissas guardadas nem fórmulas. Inclui teste de arredondamento, mudança de ano, ausência de recuperação e traduções.

## Continuação — cartões e relatório

Captura identificou cartões globais ainda ligados a casos antigos, não ao estudo novo. Na vista Investimento, o resumo passa a acompanhar o estudo ativo (VAL, TIR e dois paybacks), incluindo edições por guardar e estado de premissas inválidas. Indicadores de diagnóstico não são inferidos de projeções.

Pacote do estudo: resumo executivo condicionado ao VAL; origem e premissas; projeção anual em blocos de cinco anos; gráfico de fluxos; sensibilidade ±20%; alertas; cinco notas sobre método, recuperação, depreciação/imposto/residual, fundo de maneio e exclusões. Acesso por botão, impressão/guardar PDF pelo navegador; Excel inclui folha de notas. Não se trata de demonstrações realizadas/auditadas. Metadados identificam organização, moeda, estudo e estado de gravação. Sem alterações ao motor ou a dados guardados.

Ao abrir, o estudo guardado mais recente é selecionado automaticamente; Novo estudo continua disponível. Verificação local: 318 testes aprovados, incluindo catálogo de idiomas; typecheck aprovado. Verificação visual autenticada e impressão continuam pendentes.

## Correção de PDF e gravação — 16 outubro 2026

O PDF geral exportava a vista sem o relatório fechado; as notas existiam apenas no modal aberto. O relatório completo passa a estar disponível oculto na árvore, e tanto o PDF geral como o botão do relatório selecionam esse conteúdo para um documento de impressão isolado, removendo o estado oculto. As regras de impressão só se aplicam a um relatório visível. Dois testes verificam as cinco notas antes de abrir e a seleção/remoção de hidden nos dois caminhos de impressão. Não houve inspeção visual autenticada de impressão.

Guardar deixa de ficar silenciosamente desativado por nome/organização/moeda/premissas em falta: apresenta validação e confirmação de sucesso. O servidor devolve savedStudyId e a interface confirma exatamente esse estudo, incluindo revisão, antes de confirmar a gravação. O teste da API cria e relê o estudo devolvido; persistem os testes de conflito, acesso e rollback de auditoria. Sem migrações ou alterações aos cálculos.
