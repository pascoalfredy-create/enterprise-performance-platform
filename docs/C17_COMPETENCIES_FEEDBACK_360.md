# C17 — Competências e Feedback 360°

## Objetivo

Permitir que cada empresa configure o seu próprio framework de competências e recolha feedback de múltiplas fontes, sem regras de setor, país ou função hardcoded no Core.

## Entidades

- Framework de competências versionável.
- Competências com código, categoria e peso em pontos-base.
- Ronda 360° vinculada a uma avaliação de desempenho.
- Participantes com relação e peso explícitos.
- Respostas imutáveis por participante e competência.

## Regras determinísticas

- Um framework só é ativado quando os pesos das competências totalizam exatamente 100%.
- Ativação de framework e abertura da ronda usam maker-checker.
- Uma ronda exige pelo menos dois participantes.
- Cada participante responde a todas as competências antes da submissão.
- A pontuação por competência é a média ponderada dos participantes.
- A pontuação global aplica os pesos do framework às pontuações por competência.
- O resultado 360° não reescreve a nota final já emitida na avaliação; funciona como evidência de desenvolvimento.

## Confidencialidade

Em modo `Confidencial`, a interface consolidada não revela o autor de cada resposta. A identidade continua protegida no banco para controlo de duplicidade, autorização e auditoria.
