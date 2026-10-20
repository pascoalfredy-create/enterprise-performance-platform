-- Fase 3.2 — adaptador RH sobre o Motor Comum de Integração (0081). Não cria
-- nenhuma tabela financeira paralela: reaproveita workforce_plans/
-- workforce_plan_lines (0029) como fonte e financial_line_catalog_mappings/
-- budget_integration_movements/budget_integration_values (0081) como motor.
--
-- A única lacuna estrutural real era a correspondência entre
-- workforce_plan_lines.department_code (texto livre, sem FK) e as dimensões
-- financeiras (dimension_members) já usadas em toda a plataforma. A decisão
-- do utilizador foi explícita: nenhuma correspondência automática — um
-- código de departamento só contribui para a sincronização depois de uma
-- decisão humana explícita, guardada aqui e reaproveitada em todos os planos
-- futuros que usem o mesmo código (não é por plano nem por versão).
CREATE TABLE IF NOT EXISTS workforce_department_dimension_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  department_code TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('Mapeado','SemDimensao')),
  dimension_member_id TEXT REFERENCES dimension_members(id),
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  CHECK (
    (decision='Mapeado' AND dimension_member_id IS NOT NULL) OR
    (decision='SemDimensao' AND dimension_member_id IS NULL)
  )
);
-- Uma decisão por (tenant, código) — recriá-la substitui a anterior
-- (upsert), nunca duplica. Isto é configuração, não facto financeiro: ao
-- contrário de budget_integration_values, não é imutável — o utilizador
-- pode corrigir uma correspondência errada a qualquer momento; a próxima
-- sincronização passa a reflectir a correcção para movimentos futuros,
-- sem alterar nada que já tenha sido aplicado a uma versão aprovada.
CREATE UNIQUE INDEX IF NOT EXISTS workforce_department_dimension_decisions_uq
  ON workforce_department_dimension_decisions(tenant_id, department_code);
