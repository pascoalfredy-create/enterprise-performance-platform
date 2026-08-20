# C25 — HCM Recruitment & Onboarding

## Objetivo

Controlar a necessidade de contratação desde a requisição aprovada até ao onboarding concluído, com dados pessoais protegidos, decisões sequenciais e evidência.

## Entidades

- Requisição: organização, função, posições, orçamento, moeda, data-alvo e justificação.
- Candidato: identidade, contacto, origem e consentimento registado.
- Candidatura: pipeline, classificação e nota de decisão.
- Onboarding: responsável, data de início e tarefas com prazo e evidência.

## Workflow

- Requisição: `Rascunho → Aberta → Fechada/Cancelada`, com maker-checker na abertura.
- Candidatura: `Recebida → Triagem → Entrevista → Oferta → Contratada`, permitindo rejeição nas etapas de decisão.
- Onboarding: `Preparação → Em curso → Concluído`; a conclusão ocorre apenas quando todas as tarefas possuem evidência.

## Segurança e integração

O endpoint exige entitlement HCM e permissões sensíveis `hcm:read`/`hcm:write`, respeita âmbito organizacional e gera audit events. Uma contratação concluída prepara a futura conversão controlada para Employee Master e contrato, sem criar payroll ou vínculo automaticamente.

## Escala visual

Os cartões empresariais passam a utilizar somente três níveis: 12 px para apoio, 14 px para conteúdo e 16 px para títulos e valores. Títulos principais externos aos cartões preservam a hierarquia da página.
