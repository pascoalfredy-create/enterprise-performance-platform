# C16 — Avaliações de Desempenho

## Objetivo

Transformar objetivos mensuráveis em avaliações governadas, separando autoavaliação, decisão do gestor e calibração independente. A pontuação final é determinística e a IA não participa no cálculo.

## Regra de cálculo

- Objetivos: 60% da nota final, com progresso ponderado pelo peso de cada objetivo.
- Competências calibradas: 40% da nota final, numa escala configurada de 1 a 5.
- Todos os valores são armazenados em pontos-base (`0–10000`).
- Na avaliação do gestor, cada objetivo gera um snapshot imutável com progresso, peso e valor observado.

## Workflow e segregação

1. A avaliação nasce em `Aguardando autoavaliação` e exige ciclo ativo, organização válida e objetivos elegíveis.
2. Apenas o colaborador avaliado envia a autoavaliação.
3. Apenas o gestor designado envia a avaliação do gestor.
4. Apenas RH ou Administrador independente pode calibrar e finalizar.
5. Ações de desenvolvimento só podem nascer de avaliações finalizadas e exigem evidência para conclusão.

## Segurança e auditoria

- Entitlement obrigatório: `PERFORMANCE_MANAGEMENT`.
- Permissões: `review:read` e `review:write`.
- Isolamento por tenant e âmbito organizacional em todas as queries.
- Transições compare-and-set e invariantes também protegidos por triggers SQL.
- Avaliações, snapshots e ações de desenvolvimento não podem ser eliminados.
