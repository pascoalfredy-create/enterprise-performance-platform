-- Catálogo Universal de Rubricas Orçamentais — Fase 1 (só o catálogo).
--
-- financial_line_catalog already is the tenant-scoped "plano de contas" every
-- financial dashboard joins on (by code) — it stays exactly as it is (same
-- id/code/classification/cash_flow_category/sign_mode/status, same
-- UNIQUE(tenant_id,code), same 0065 immutability triggers on linked rows).
-- Hierarchy, visibility, nature/kind, origin and the rest are new, purely
-- additive columns (ALTER TABLE ADD COLUMN only — the standard rebuild
-- pattern for widening a CHECK proved unsafe against this D1 database, see
-- 0077's history; nothing here needs a CHECK widened, so plain ADD COLUMN
-- is both sufficient and the lower-risk choice).
--
-- A separate, non-tenant-scoped financial_line_catalog_templates table is
-- the "biblioteca universal de referência": one global tree a tenant can
-- adopt (copy) into its own financial_line_catalog, then customise freely
-- — adoption is a one-time copy, never a live sync, so one tenant's
-- customisation can never leak into another's and a later re-adoption
-- cannot silently overwrite what a tenant already changed.

CREATE TABLE IF NOT EXISTS financial_line_catalog_templates (
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 classification TEXT NOT NULL CHECK(classification IN ('Receita','Custo','Ativo','Passivo','Capital','Caixa','Outro')),
 cash_flow_category TEXT NOT NULL CHECK(cash_flow_category IN ('Operacional','Investimento','Financiamento','Não aplicável')),
 sign_mode TEXT NOT NULL CHECK(sign_mode IN ('Natural','Inverter')),
 line_kind TEXT NOT NULL CHECK(line_kind IN ('Agregação','Analítica','Calculada')),
 parent_id TEXT REFERENCES financial_line_catalog_templates(id),
 level INTEGER NOT NULL,
 display_order INTEGER NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS financial_line_catalog_templates_parent_idx ON financial_line_catalog_templates(parent_id,display_order);

CREATE TRIGGER IF NOT EXISTS financial_line_catalog_templates_hierarchy_guard BEFORE INSERT ON financial_line_catalog_templates
WHEN NEW.parent_id IS NOT NULL AND (
 NEW.id=NEW.parent_id
 OR NOT EXISTS(SELECT 1 FROM financial_line_catalog_templates WHERE id=NEW.parent_id)
 OR EXISTS(
  WITH RECURSIVE chain(id) AS (
   SELECT NEW.parent_id
   UNION ALL
   SELECT t.parent_id FROM financial_line_catalog_templates t JOIN chain c ON t.id=c.id WHERE t.parent_id IS NOT NULL
  )
  SELECT 1 FROM chain WHERE id=NEW.id
 )
)
BEGIN SELECT RAISE(ABORT,'invalid template hierarchy: missing parent or would create a cycle'); END;

-- Biblioteca universal de referência (demonstrativo do pedido original):
-- 4 grupos, 8 categorias, 19 rubricas analíticas. Grupos e categorias são
-- 'Agregação' (nunca recebem lançamentos directos); só as rubricas de
-- último nível são 'Analítica'.
INSERT OR IGNORE INTO financial_line_catalog_templates (id,code,name,classification,cash_flow_category,sign_mode,line_kind,parent_id,level,display_order,description,created_at) VALUES
('01','01','Receitas e rendimentos','Receita','Operacional','Natural','Agregação',NULL,1,1,'','2026-01-01T00:00:00.000Z'),
('01.01','01.01','Vendas de produtos','Receita','Operacional','Natural','Agregação','01',2,1,'','2026-01-01T00:00:00.000Z'),
('01.01.01','01.01.01','Mercadorias','Receita','Operacional','Natural','Analítica','01.01',3,1,'','2026-01-01T00:00:00.000Z'),
('01.01.02','01.01.02','Produtos acabados','Receita','Operacional','Natural','Analítica','01.01',3,2,'','2026-01-01T00:00:00.000Z'),
('01.02','01.02','Prestação de serviços','Receita','Operacional','Natural','Agregação','01',2,2,'','2026-01-01T00:00:00.000Z'),
('01.02.01','01.02.01','Serviços recorrentes','Receita','Operacional','Natural','Analítica','01.02',3,1,'','2026-01-01T00:00:00.000Z'),
('01.02.02','01.02.02','Serviços por projecto','Receita','Operacional','Natural','Analítica','01.02',3,2,'','2026-01-01T00:00:00.000Z'),
('02','02','Custos directos','Custo','Operacional','Natural','Agregação',NULL,1,2,'','2026-01-01T00:00:00.000Z'),
('02.01','02.01','Materiais e consumíveis','Custo','Operacional','Natural','Agregação','02',2,1,'','2026-01-01T00:00:00.000Z'),
('02.01.01','02.01.01','Matérias-primas','Custo','Operacional','Natural','Analítica','02.01',3,1,'','2026-01-01T00:00:00.000Z'),
('02.01.02','02.01.02','Consumíveis de produção','Custo','Operacional','Natural','Analítica','02.01',3,2,'','2026-01-01T00:00:00.000Z'),
('02.02','02.02','Operação','Custo','Operacional','Natural','Agregação','02',2,2,'','2026-01-01T00:00:00.000Z'),
('02.02.01','02.02.01','Combustíveis','Custo','Operacional','Natural','Analítica','02.02',3,1,'','2026-01-01T00:00:00.000Z'),
('02.02.02','02.02.02','Subcontratação','Custo','Operacional','Natural','Analítica','02.02',3,2,'','2026-01-01T00:00:00.000Z'),
('03','03','Gastos com pessoal','Custo','Operacional','Natural','Agregação',NULL,1,3,'','2026-01-01T00:00:00.000Z'),
('03.01','03.01','Remunerações','Custo','Operacional','Natural','Agregação','03',2,1,'','2026-01-01T00:00:00.000Z'),
('03.01.01','03.01.01','Salário base','Custo','Operacional','Natural','Analítica','03.01',3,1,'','2026-01-01T00:00:00.000Z'),
('03.01.02','03.01.02','Subsídios','Custo','Operacional','Natural','Analítica','03.01',3,2,'','2026-01-01T00:00:00.000Z'),
('03.01.03','03.01.03','Remunerações variáveis','Custo','Operacional','Natural','Analítica','03.01',3,3,'','2026-01-01T00:00:00.000Z'),
('03.02','03.02','Encargos','Custo','Operacional','Natural','Agregação','03',2,2,'','2026-01-01T00:00:00.000Z'),
('03.02.01','03.02.01','Contribuições patronais','Custo','Operacional','Natural','Analítica','03.02',3,1,'','2026-01-01T00:00:00.000Z'),
('03.02.02','03.02.02','Benefícios','Custo','Operacional','Natural','Analítica','03.02',3,2,'','2026-01-01T00:00:00.000Z'),
('04','04','Investimentos','Ativo','Investimento','Natural','Agregação',NULL,1,4,'','2026-01-01T00:00:00.000Z'),
('04.01','04.01','Activos tangíveis','Ativo','Investimento','Natural','Agregação','04',2,1,'','2026-01-01T00:00:00.000Z'),
('04.01.01','04.01.01','Equipamentos','Ativo','Investimento','Natural','Analítica','04.01',3,1,'','2026-01-01T00:00:00.000Z'),
('04.01.02','04.01.02','Viaturas','Ativo','Investimento','Natural','Analítica','04.01',3,2,'','2026-01-01T00:00:00.000Z'),
('04.01.03','04.01.03','Instalações','Ativo','Investimento','Natural','Analítica','04.01',3,3,'','2026-01-01T00:00:00.000Z'),
('04.02','04.02','Activos intangíveis','Ativo','Investimento','Natural','Agregação','04',2,2,'','2026-01-01T00:00:00.000Z'),
('04.02.01','04.02.01','Software','Ativo','Investimento','Natural','Analítica','04.02',3,1,'','2026-01-01T00:00:00.000Z'),
('04.02.02','04.02.02','Licenças','Ativo','Investimento','Natural','Analítica','04.02',3,2,'','2026-01-01T00:00:00.000Z');

-- financial_line_catalog: hierarchy, visibility, nature/kind, origin and ficha
-- fields. All nullable or DEFAULT-backed so every existing row (and every
-- one of the 12 existing files that already read this table) keeps working
-- unchanged: level defaults every current row to a flat root (1), hidden
-- defaults to visible, line_kind defaults to 'Analítica' (today's only real
-- behaviour — every existing row already takes direct postings).
ALTER TABLE financial_line_catalog ADD COLUMN parent_id TEXT REFERENCES financial_line_catalog(id);
ALTER TABLE financial_line_catalog ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE financial_line_catalog ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE financial_line_catalog ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1));
ALTER TABLE financial_line_catalog ADD COLUMN line_kind TEXT NOT NULL DEFAULT 'Analítica' CHECK(line_kind IN ('Agregação','Analítica','Calculada'));
-- source_type records only the *primary/default* origin shown on the ficha;
-- it is descriptive, not a constraint — nothing here stops a rubrica from
-- later being fed by more than one source once the Fase 3 integration
-- engine (out of scope here) is built on top of financial_line_catalog_mappings.
ALTER TABLE financial_line_catalog ADD COLUMN source_type TEXT NOT NULL DEFAULT 'Manual' CHECK(source_type IN ('Manual','RH','Financeiro','Investimentos','Forecast','Importação externa','Fórmula'));
ALTER TABLE financial_line_catalog ADD COLUMN manual_adjustment_allowed INTEGER NOT NULL DEFAULT 1 CHECK(manual_adjustment_allowed IN (0,1));
ALTER TABLE financial_line_catalog ADD COLUMN description TEXT NOT NULL DEFAULT '';
-- Storage only for a future 'Calculada' rubrica's expression — no evaluation
-- engine is built in this phase (adiado para a Fase 3).
ALTER TABLE financial_line_catalog ADD COLUMN formula_expression TEXT;
-- Tracks which universal-library row a rubrica was adopted from, if any —
-- purely informational (e.g. a future "o que há de novo na biblioteca"
-- diff), never auto-applied back onto a tenant's customised row.
ALTER TABLE financial_line_catalog ADD COLUMN template_id TEXT REFERENCES financial_line_catalog_templates(id);

CREATE INDEX IF NOT EXISTS financial_line_catalog_hierarchy_idx ON financial_line_catalog(tenant_id,parent_id,display_order);

-- Schema groundwork for the deferred (Fase 3) "Mapear" action: associate a
-- rubrica with another module/external source. No write path uses this
-- table yet — it exists so Fase 3 does not need another migration just to
-- start recording mappings.
CREATE TABLE IF NOT EXISTS financial_line_catalog_mappings (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 line_id TEXT NOT NULL REFERENCES financial_line_catalog(id),
 source_module TEXT NOT NULL,
 source_reference TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(tenant_id,line_id,source_module,source_reference)
);

-- Hierarchy integrity: a parent must exist in the same tenant, a rubrica
-- cannot be its own parent, and no chain of parents may loop back onto the
-- row being written (same WITH RECURSIVE ancestor-walk pattern already
-- used for employee_reporting_lines' management-chain cycle guard).
CREATE TRIGGER IF NOT EXISTS financial_line_catalog_hierarchy_guard_insert BEFORE INSERT ON financial_line_catalog
WHEN NEW.parent_id IS NOT NULL AND (
 NEW.id=NEW.parent_id
 OR NOT EXISTS(SELECT 1 FROM financial_line_catalog WHERE id=NEW.parent_id AND tenant_id=NEW.tenant_id)
 OR EXISTS(
  WITH RECURSIVE chain(id) AS (
   SELECT NEW.parent_id
   UNION ALL
   SELECT l.parent_id FROM financial_line_catalog l JOIN chain c ON l.id=c.id WHERE l.tenant_id=NEW.tenant_id AND l.parent_id IS NOT NULL
  )
  SELECT 1 FROM chain WHERE id=NEW.id
 )
)
BEGIN SELECT RAISE(ABORT,'invalid rubrica hierarchy: parent outside tenant or would create a cycle'); END;

CREATE TRIGGER IF NOT EXISTS financial_line_catalog_hierarchy_guard_update BEFORE UPDATE OF parent_id ON financial_line_catalog
WHEN NEW.parent_id IS NOT NULL AND (
 NEW.id=NEW.parent_id
 OR NOT EXISTS(SELECT 1 FROM financial_line_catalog WHERE id=NEW.parent_id AND tenant_id=NEW.tenant_id)
 OR EXISTS(
  WITH RECURSIVE chain(id) AS (
   SELECT NEW.parent_id
   UNION ALL
   SELECT l.parent_id FROM financial_line_catalog l JOIN chain c ON l.id=c.id WHERE l.tenant_id=NEW.tenant_id AND l.parent_id IS NOT NULL
  )
  SELECT 1 FROM chain WHERE id=NEW.id
 )
)
BEGIN SELECT RAISE(ABORT,'invalid rubrica hierarchy: parent outside tenant or would create a cycle'); END;

-- Historical integrity (additive — 0065 already protects linked rows'
-- code/classification from being changed; this closes the remaining gap:
-- today nothing stops physically deleting a line that budget/actual rows
-- or sub-rubricas still point to).
CREATE TRIGGER IF NOT EXISTS financial_line_catalog_usage_no_delete BEFORE DELETE ON financial_line_catalog
WHEN EXISTS(SELECT 1 FROM performance_entries e WHERE e.tenant_id=OLD.tenant_id AND e.line_code=OLD.code)
BEGIN SELECT RAISE(ABORT,'rubrica com movimentos ou orçamentos não pode ser eliminada'); END;

CREATE TRIGGER IF NOT EXISTS financial_line_catalog_children_no_delete BEFORE DELETE ON financial_line_catalog
WHEN EXISTS(SELECT 1 FROM financial_line_catalog c WHERE c.parent_id=OLD.id AND c.tenant_id=OLD.tenant_id)
BEGIN SELECT RAISE(ABORT,'rubrica com sub-rubricas não pode ser eliminada'); END;

-- dimension_members already self-references via parent_id (0001) and
-- already validates same-tenant-and-dimension on insert (0007's
-- dimension_members_dimension_tenant_insert), but has no cycle guard —
-- a pre-existing gap, fixed here additively (new trigger only; the 0007
-- trigger and all existing data are untouched).
CREATE TRIGGER IF NOT EXISTS dimension_members_cycle_guard_insert BEFORE INSERT ON dimension_members
WHEN NEW.parent_id IS NOT NULL AND NEW.id<>NEW.parent_id AND EXISTS(
 WITH RECURSIVE chain(id) AS (
  SELECT NEW.parent_id
  UNION ALL
  SELECT m.parent_id FROM dimension_members m JOIN chain c ON m.id=c.id WHERE m.tenant_id=NEW.tenant_id AND m.parent_id IS NOT NULL
 )
 SELECT 1 FROM chain WHERE id=NEW.id
)
BEGIN SELECT RAISE(ABORT,'invalid dimension member hierarchy: would create a cycle'); END;

CREATE TRIGGER IF NOT EXISTS dimension_members_cycle_guard_update BEFORE UPDATE OF parent_id ON dimension_members
WHEN NEW.parent_id IS NOT NULL AND NEW.id<>NEW.parent_id AND EXISTS(
 WITH RECURSIVE chain(id) AS (
  SELECT NEW.parent_id
  UNION ALL
  SELECT m.parent_id FROM dimension_members m JOIN chain c ON m.id=c.id WHERE m.tenant_id=NEW.tenant_id AND m.parent_id IS NOT NULL
 )
 SELECT 1 FROM chain WHERE id=NEW.id
)
BEGIN SELECT RAISE(ABORT,'invalid dimension member hierarchy: would create a cycle'); END;
