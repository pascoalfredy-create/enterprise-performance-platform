# C7 — Onboarding real da primeira empresa

## Objetivo

Levar o Administrador de um tenant recém-provisionado à base mínima governada antes de executar processos de Finance, HCM e Payroll.

## Readiness calculada no servidor

O estado de onboarding é derivado de dados persistidos, nunca de flags do browser:

1. pelo menos uma organização ativa;
2. pelo menos um utilizador ativo;
3. pelo menos um colaborador;
4. pelo menos uma dimensão financeira ativa.

Enquanto a base estiver incompleta, o Administrador entra em Administração e vê o progresso real. Depois de concluída, a plataforma abre normalmente na área compatível com o seu âmbito e módulos.

## Remoção de dados ilustrativos

Foram removidos colaboradores, KPI, desvios e valores financeiros fictícios do fallback inicial. Dashboard, HCM, Payroll, Workforce e Management Reports mostram exclusivamente dados do tenant ou estados vazios explícitos.

## Próximo controlo

Adicionar um readiness operacional por motor: Finance exige organização, dimensão e versão; Payroll exige colaborador, contrato ativo e perfil salarial; Workforce exige Payroll fechado; reporting exige dados comparáveis e lineage.
