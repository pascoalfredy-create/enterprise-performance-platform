CREATE TABLE IF NOT EXISTS financial_models (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,name TEXT NOT NULL,currency TEXT NOT NULL,start_period TEXT NOT NULL,horizon_months INTEGER NOT NULL CHECK(horizon_months BETWEEN 1 AND 240),opening_cash_minor INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('Rascunho','Calculado','Aprovado')),version_number INTEGER NOT NULL CHECK(version_number>0),input_hash TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,calculated_by TEXT,calculated_at TEXT,approved_by TEXT,approved_at TEXT,approval_hash TEXT,
 FOREIGN KEY(organization_id) REFERENCES organizations(id),UNIQUE(tenant_id,organization_id,name,version_number)
);
CREATE TABLE IF NOT EXISTS financial_model_lines (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,model_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,line_type TEXT NOT NULL CHECK(line_type IN ('Receita','Custo','CAPEX','Financiamento','Imposto','Outro')),
 base_amount_minor INTEGER NOT NULL,growth_bps INTEGER NOT NULL DEFAULT 0 CHECK(growth_bps BETWEEN -10000 AND 100000),cash_lag_months INTEGER NOT NULL DEFAULT 0 CHECK(cash_lag_months BETWEEN 0 AND 36),created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(model_id) REFERENCES financial_models(id),UNIQUE(tenant_id,model_id,code)
);
CREATE TABLE IF NOT EXISTS financial_projections (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,model_id TEXT NOT NULL,line_id TEXT NOT NULL,period TEXT NOT NULL,cash_period TEXT NOT NULL,sequence_number INTEGER NOT NULL,statement_amount_minor INTEGER NOT NULL,cash_amount_minor INTEGER NOT NULL,formula_hash TEXT NOT NULL,
 FOREIGN KEY(model_id) REFERENCES financial_models(id),FOREIGN KEY(line_id) REFERENCES financial_model_lines(id),UNIQUE(tenant_id,model_id,line_id,period)
);
CREATE INDEX IF NOT EXISTS financial_models_scope_idx ON financial_models(tenant_id,organization_id,status,start_period);
CREATE INDEX IF NOT EXISTS financial_projection_period_idx ON financial_projections(tenant_id,model_id,period,line_id);

CREATE TRIGGER IF NOT EXISTS financial_model_reference_guard BEFORE INSERT ON financial_models
WHEN length(NEW.currency)<>3 OR NEW.start_period NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' OR NOT EXISTS(SELECT 1 FROM organizations o WHERE o.id=NEW.organization_id AND o.tenant_id=NEW.tenant_id AND o.status='Ativa')
BEGIN SELECT RAISE(ABORT,'invalid financial model reference'); END;
CREATE TRIGGER IF NOT EXISTS financial_model_line_guard BEFORE INSERT ON financial_model_lines
WHEN NOT EXISTS(SELECT 1 FROM financial_models m WHERE m.id=NEW.model_id AND m.tenant_id=NEW.tenant_id AND m.status='Rascunho')
BEGIN SELECT RAISE(ABORT,'financial model is not editable'); END;
CREATE TRIGGER IF NOT EXISTS financial_model_line_immutable_update BEFORE UPDATE ON financial_model_lines BEGIN SELECT RAISE(ABORT,'financial model lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS financial_model_line_no_delete BEFORE DELETE ON financial_model_lines BEGIN SELECT RAISE(ABORT,'financial model lines cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS financial_projection_guard BEFORE INSERT ON financial_projections
WHEN NOT EXISTS(SELECT 1 FROM financial_models m JOIN financial_model_lines l ON l.model_id=m.id AND l.tenant_id=m.tenant_id WHERE m.id=NEW.model_id AND m.tenant_id=NEW.tenant_id AND m.status='Rascunho' AND l.id=NEW.line_id)
BEGIN SELECT RAISE(ABORT,'invalid financial projection reference'); END;
CREATE TRIGGER IF NOT EXISTS financial_projection_immutable_update BEFORE UPDATE ON financial_projections BEGIN SELECT RAISE(ABORT,'financial projections are immutable'); END;
CREATE TRIGGER IF NOT EXISTS financial_projection_no_delete BEFORE DELETE ON financial_projections BEGIN SELECT RAISE(ABORT,'financial projections cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS financial_model_transition_guard BEFORE UPDATE ON financial_models
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.organization_id<>OLD.organization_id OR NEW.name<>OLD.name OR NEW.currency<>OLD.currency OR NEW.start_period<>OLD.start_period OR NEW.horizon_months<>OLD.horizon_months OR NEW.opening_cash_minor<>OLD.opening_cash_minor OR NEW.version_number<>OLD.version_number OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT ((OLD.status='Rascunho' AND NEW.status='Calculado' AND NEW.input_hash IS NOT NULL AND EXISTS(SELECT 1 FROM financial_projections p WHERE p.model_id=OLD.id AND p.tenant_id=OLD.tenant_id)) OR (OLD.status='Calculado' AND NEW.status='Aprovado' AND NEW.approval_hash IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'invalid financial model transition'); END;
CREATE TRIGGER IF NOT EXISTS financial_model_no_delete BEFORE DELETE ON financial_models BEGIN SELECT RAISE(ABORT,'financial models cannot be deleted'); END;
