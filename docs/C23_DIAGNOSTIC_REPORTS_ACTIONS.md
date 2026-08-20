# C23 — Relatórios de diagnóstico e planos de melhoria

## Objetivo

Fechar o ciclo `resultado → comparação → causa → impacto → perspetiva → recomendação → ação` sem utilizar IA como fonte de verdade.

## Relatório formal

- Só pode ser emitido a partir de um diagnóstico aprovado.
- Tem numeração sequencial por tenant e apenas uma emissão por diagnóstico.
- Guarda o resultado, comparação com o período aprovado anterior, causas, impacto, contexto setorial, recomendações e hashes da evidência.
- O payload e o respetivo hash são imutáveis; atualização e eliminação são bloqueadas na base de dados.

## Plano de melhoria

- Nasce de um resultado pertencente a um diagnóstico aprovado.
- Preserva a recomendação original como snapshot.
- Exige título, responsável ativo, prazo e prioridade.
- Workflow permitido: `Aberta → Em curso → Concluída` ou cancelamento antes da conclusão.
- A conclusão exige evidência descritiva verificável.
- O responsável, Administrador ou Financeiro podem gerir a transição, conforme RBAC e âmbito organizacional.

## Determinismo e auditoria

O relatório é composto exclusivamente por resultados calculados, regras configuradas, contexto do Industry Pack e diagnósticos aprovados anteriores. A operação gera hash SHA-256 e audit event. IA futura poderá explicar ou resumir, mas nunca calcular, classificar, aprovar ou substituir a evidência formal.
