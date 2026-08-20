CREATE TABLE IF NOT EXISTS fx_rate_sets (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,period TEXT NOT NULL,base_currency TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Rascunho','Aprovado','Arquivado')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 approved_by TEXT,approved_at TEXT,UNIQUE(tenant_id,period,base_currency,name)
);
CREATE TABLE IF NOT EXISTS fx_rates (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,rate_set_id TEXT NOT NULL,source_currency TEXT NOT NULL,target_currency TEXT NOT NULL,
 rate_scaled INTEGER NOT NULL CHECK(rate_scaled>0),scale INTEGER NOT NULL DEFAULT 100000000 CHECK(scale=100000000),created_at TEXT NOT NULL,
 FOREIGN KEY(rate_set_id) REFERENCES fx_rate_sets(id),UNIQUE(tenant_id,rate_set_id,source_currency,target_currency)
);
CREATE TABLE IF NOT EXISTS consolidation_runs (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,rate_set_id TEXT NOT NULL,period TEXT NOT NULL,target_currency TEXT NOT NULL,run_number INTEGER NOT NULL CHECK(run_number>0),
 status TEXT NOT NULL CHECK(status IN ('Calculado','Aprovado')),source_count INTEGER NOT NULL,organization_count INTEGER NOT NULL,
 currency_count INTEGER NOT NULL,converted_total_minor INTEGER NOT NULL,adjustment_total_minor INTEGER NOT NULL DEFAULT 0,
 reported_total_minor INTEGER NOT NULL,input_hash TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 approved_by TEXT,approved_at TEXT,approval_hash TEXT,FOREIGN KEY(rate_set_id) REFERENCES fx_rate_sets(id),
 UNIQUE(tenant_id,period,target_currency,run_number)
);
CREATE TABLE IF NOT EXISTS consolidation_lines (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,run_id TEXT NOT NULL,organization_id TEXT NOT NULL,source_currency TEXT NOT NULL,
 target_currency TEXT NOT NULL,line_code TEXT NOT NULL,line_name TEXT NOT NULL,source_amount_minor INTEGER NOT NULL,
 rate_scaled INTEGER NOT NULL,converted_amount_minor INTEGER NOT NULL,source_count INTEGER NOT NULL,source_hash TEXT NOT NULL,
 FOREIGN KEY(run_id) REFERENCES consolidation_runs(id),FOREIGN KEY(organization_id) REFERENCES organizations(id),
 UNIQUE(tenant_id,run_id,organization_id,source_currency,line_code)
);
CREATE TABLE IF NOT EXISTS consolidation_adjustments (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,run_id TEXT NOT NULL,line_code TEXT NOT NULL,line_name TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor<>0),adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('Eliminação','Ajustamento')),
 reason TEXT NOT NULL,evidence TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(run_id) REFERENCES consolidation_runs(id)
);
CREATE INDEX IF NOT EXISTS fx_rate_sets_scope_idx ON fx_rate_sets(tenant_id,period,base_currency,status);
CREATE INDEX IF NOT EXISTS consolidation_runs_scope_idx ON consolidation_runs(tenant_id,period,target_currency,status);
CREATE INDEX IF NOT EXISTS consolidation_lines_drill_idx ON consolidation_lines(tenant_id,run_id,line_code,organization_id);
CREATE TRIGGER IF NOT EXISTS fx_rate_reference_guard BEFORE INSERT ON fx_rates
WHEN NEW.source_currency=NEW.target_currency OR NOT EXISTS(SELECT 1 FROM fx_rate_sets s WHERE s.id=NEW.rate_set_id AND s.tenant_id=NEW.tenant_id AND s.status='Rascunho' AND s.base_currency=NEW.target_currency)
BEGIN SELECT RAISE(ABORT,'invalid FX rate reference'); END;
CREATE TRIGGER IF NOT EXISTS fx_rate_immutable_update BEFORE UPDATE ON fx_rates BEGIN SELECT RAISE(ABORT,'FX rates are immutable'); END;
CREATE TRIGGER IF NOT EXISTS fx_rate_no_delete BEFORE DELETE ON fx_rates BEGIN SELECT RAISE(ABORT,'FX rates cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS fx_rate_set_transition_guard BEFORE UPDATE ON fx_rate_sets
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.name<>OLD.name OR NEW.period<>OLD.period OR NEW.base_currency<>OLD.base_currency OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT ((OLD.status='Rascunho' AND NEW.status='Aprovado' AND EXISTS(SELECT 1 FROM fx_rates r WHERE r.rate_set_id=OLD.id AND r.tenant_id=OLD.tenant_id)) OR (OLD.status='Aprovado' AND NEW.status='Arquivado'))
BEGIN SELECT RAISE(ABORT,'invalid FX rate set transition'); END;
CREATE TRIGGER IF NOT EXISTS fx_rate_set_no_delete BEFORE DELETE ON fx_rate_sets BEGIN SELECT RAISE(ABORT,'FX rate sets cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS consolidation_line_guard BEFORE INSERT ON consolidation_lines
WHEN NOT EXISTS(SELECT 1 FROM consolidation_runs r JOIN organizations o ON o.tenant_id=r.tenant_id WHERE r.id=NEW.run_id AND r.tenant_id=NEW.tenant_id AND r.status='Calculado' AND o.id=NEW.organization_id)
BEGIN SELECT RAISE(ABORT,'invalid consolidation line reference'); END;
CREATE TRIGGER IF NOT EXISTS consolidation_line_immutable_update BEFORE UPDATE ON consolidation_lines BEGIN SELECT RAISE(ABORT,'consolidation lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS consolidation_line_immutable_delete BEFORE DELETE ON consolidation_lines BEGIN SELECT RAISE(ABORT,'consolidation lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS consolidation_adjustment_guard BEFORE INSERT ON consolidation_adjustments
WHEN length(NEW.reason)<10 OR length(NEW.evidence)<3 OR NOT EXISTS(SELECT 1 FROM consolidation_runs r WHERE r.id=NEW.run_id AND r.tenant_id=NEW.tenant_id AND r.status='Calculado')
BEGIN SELECT RAISE(ABORT,'invalid consolidation adjustment'); END;
CREATE TRIGGER IF NOT EXISTS consolidation_adjustment_immutable_update BEFORE UPDATE ON consolidation_adjustments BEGIN SELECT RAISE(ABORT,'consolidation adjustments are immutable'); END;
CREATE TRIGGER IF NOT EXISTS consolidation_adjustment_no_delete BEFORE DELETE ON consolidation_adjustments BEGIN SELECT RAISE(ABORT,'consolidation adjustments cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS consolidation_run_transition_guard BEFORE UPDATE ON consolidation_runs
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.rate_set_id<>OLD.rate_set_id OR NEW.period<>OLD.period OR NEW.target_currency<>OLD.target_currency OR NEW.run_number<>OLD.run_number OR NEW.source_count<>OLD.source_count OR NEW.organization_count<>OLD.organization_count OR NEW.currency_count<>OLD.currency_count OR NEW.converted_total_minor<>OLD.converted_total_minor OR NEW.input_hash<>OLD.input_hash OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT (OLD.status='Calculado' AND NEW.status='Aprovado' AND NEW.adjustment_total_minor=(SELECT COALESCE(SUM(amount_minor),0) FROM consolidation_adjustments a WHERE a.tenant_id=OLD.tenant_id AND a.run_id=OLD.id) AND NEW.reported_total_minor=OLD.converted_total_minor+NEW.adjustment_total_minor AND NEW.approval_hash IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid consolidation run transition'); END;
CREATE TRIGGER IF NOT EXISTS consolidation_run_no_delete BEFORE DELETE ON consolidation_runs BEGIN SELECT RAISE(ABORT,'consolidation runs cannot be deleted'); END;
