# C27 — Payroll Loans & Advances

## Objetivo

Gerir empréstimos e adiantamentos desde o pedido até à liquidação, com plano determinístico, aprovação independente e dedução reconciliada com o Payroll Run.

## Regras e workflow

- Valores são guardados em unidades monetárias mínimas; a divisão distribui o resto pelas primeiras prestações, garantindo que a soma coincide exatamente com o principal.
- Fluxo: `Pendente → Aprovado/Rejeitado`; aprovado termina em `Liquidado` somente após todas as prestações processadas.
- Maker-checker impede o solicitante de aprovar o próprio pedido.
- A prestação entra no cálculo do Payroll como dedução `LOAN:<referência>`; só reduz o saldo quando o run fecha.
- Moeda da prestação deve coincidir com a moeda do Payroll.

## Segurança, API, UI e auditoria

O contrato `/api/v1/payroll-loans` exige entitlement PAYROLL e `payroll:read`/`payroll:write`, respeita âmbito organizacional, não permite exclusão de histórico e emite audit events. Country Packs podem definir limites e políticas de elegibilidade sem alterar o Core.
