# C10 — Lotes de pagamento salarial

## Objetivo

Converter recibos de um Payroll fechado numa instrução de pagamento controlada, reconciliada e auditável, sem integrar ainda um banco específico.

## Regras implementadas

- O lote exige Payroll fechado e todos os recibos emitidos.
- O total do lote deve reconciliar exatamente com o líquido do Payroll Run.
- Cada Payroll Run e cada recibo entram no máximo num lote.
- A preparação repetida é idempotente.
- Linhas, montantes e hash são imutáveis.
- O workflow é sequencial: `Preparado → Aprovado → Exportado`.
- Preparação pertence a Payroll/RH; aprovação e exportação exigem Administrador.
- Cada transição cria evidência no audit trail.

## Limite responsável

O Core não contém formatos bancários, IBAN, regras nacionais ou integração de pagamento. Esses elementos serão configurados por conectores e Country Packs. `Exportado` significa que a instrução foi fechada para entrega ao conector, não que o banco confirmou o pagamento.
