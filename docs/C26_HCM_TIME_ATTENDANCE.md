# C26 — HCM Time & Attendance

## Objetivo

Controlar turnos, marcações e timesheets mensais, produzindo horas normais e extraordinárias determinísticas antes de qualquer cálculo salarial.

## Entidades e regras

- `attendance_shifts`: horário, pausa e minutos previstos; configurável por tenant, sem regras laborais no Core.
- `attendance_assignments`: vigência do turno por colaborador e encerramento da atribuição anterior.
- `attendance_entries`: uma marcação diária imutável depois de fechada; duração e extraordinário em minutos inteiros.
- `attendance_timesheets`: snapshot mensal com totais e SHA-256 dos registos de origem.

## Workflow, permissões e integração

O fluxo é `Rascunho → Submetido → Aprovado/Rejeitado`, com maker-checker. Leitura exige `hcm:read`; comandos exigem `hcm:write`, entitlement HCM e âmbito organizacional. Timesheets aprovados expõem os minutos extraordinários ao Payroll; o Country Pack decide taxa, elegibilidade, arredondamento e incidências. O Core nunca calcula legislação por inferência.

## UI, testes e auditoria

A interface apresenta contexto, exceção, total e próxima ação. Os testes cobrem isolamento de tenant, imutabilidade, transições sequenciais, hash e escala tipográfica empresarial 12/14/16 px. Cada comando produz evento de auditoria.
