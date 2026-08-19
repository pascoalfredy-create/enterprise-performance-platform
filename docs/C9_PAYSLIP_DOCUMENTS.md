# C9 — Recibos salariais auditáveis

## Objetivo

Emitir documentos salariais somente a partir de resultados de Payroll fechados e imutáveis.

## Regras

- Um Payroll Run deve estar `Fechado`.
- Cada linha do run origina no máximo um recibo.
- A emissão repetida é idempotente e não duplica documentos.
- Montantes são copiados da linha fechada; o browser não fornece valores.
- O payload inclui colaborador, organização, período, moeda, base, bruto, deduções, custo patronal, líquido, inputs e hash de cálculo.
- O documento recebe um hash SHA-256 próprio e não pode ser alterado ou eliminado.
- A leitura exige `payroll:read`; a emissão exige `payroll:write`.
- Tenant e âmbito organizacional são preservados em todo o fluxo.

## UI

O workspace Payroll contém a área **Recibos**, emissão a partir do run fechado, pré-visualização, evidência do hash e impressão/PDF pelo browser.

## Limite deste slice

O recibo demonstra a estrutura documental determinística. Impostos, contribuições, layout legal e campos obrigatórios serão fornecidos por Country Packs versionados; não estão hardcoded no Core.
