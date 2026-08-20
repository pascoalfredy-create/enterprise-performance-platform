CREATE TABLE IF NOT EXISTS diagnostic_line_roles (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,line_id TEXT NOT NULL,role_code TEXT NOT NULL CHECK(role_code IN ('REVENUE','COGS','OPEX','INTEREST','TAX','CASH','RECEIVABLES','INVENTORY','OTHER_CURRENT_ASSET','NONCURRENT_ASSET','PAYABLES','CURRENT_DEBT','OTHER_CURRENT_LIABILITY','LONGTERM_DEBT','OTHER_NONCURRENT_LIABILITY','EQUITY','OPERATING_CASH_FLOW')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(line_id) REFERENCES financial_line_catalog(id),UNIQUE(tenant_id,line_id),UNIQUE(tenant_id,role_code,line_id)
);
CREATE TABLE IF NOT EXISTS diagnostic_frameworks (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT,status TEXT NOT NULL CHECK(status IN ('Rascunho','Ativo','Arquivado')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,activated_by TEXT,activated_at TEXT,UNIQUE(tenant_id,name)
);
CREATE TABLE IF NOT EXISTS diagnostic_metric_configs (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,framework_id TEXT NOT NULL,metric_code TEXT NOT NULL,weight_bps INTEGER NOT NULL CHECK(weight_bps>0 AND weight_bps<=10000),created_at TEXT NOT NULL,
 FOREIGN KEY(framework_id) REFERENCES diagnostic_frameworks(id),UNIQUE(tenant_id,framework_id,metric_code)
);
CREATE TABLE IF NOT EXISTS diagnostic_rules (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,framework_id TEXT NOT NULL,metric_code TEXT NOT NULL,min_value_bps INTEGER,max_value_bps INTEGER,score_bps INTEGER NOT NULL CHECK(score_bps BETWEEN 0 AND 10000),severity TEXT NOT NULL CHECK(severity IN ('Saudável','Atenção','Crítica')),recommendation TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(framework_id) REFERENCES diagnostic_frameworks(id),CHECK(min_value_bps IS NULL OR max_value_bps IS NULL OR min_value_bps<=max_value_bps)
);
CREATE TABLE IF NOT EXISTS diagnostic_runs (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,framework_id TEXT NOT NULL,period TEXT NOT NULL,currency TEXT NOT NULL,run_number INTEGER NOT NULL CHECK(run_number>0),status TEXT NOT NULL CHECK(status IN ('Calculado','Aprovado')),overall_score_bps INTEGER NOT NULL CHECK(overall_score_bps BETWEEN 0 AND 10000),input_hash TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,approved_by TEXT,approved_at TEXT,approval_hash TEXT,
 FOREIGN KEY(organization_id) REFERENCES organizations(id),FOREIGN KEY(framework_id) REFERENCES diagnostic_frameworks(id),UNIQUE(tenant_id,organization_id,framework_id,period,currency,run_number)
);
CREATE TABLE IF NOT EXISTS diagnostic_results (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,run_id TEXT NOT NULL,metric_code TEXT NOT NULL,metric_label TEXT NOT NULL,value_scaled INTEGER NOT NULL,scale INTEGER NOT NULL,score_bps INTEGER,severity TEXT,recommendation TEXT,formula TEXT NOT NULL,input_hash TEXT NOT NULL,
 FOREIGN KEY(run_id) REFERENCES diagnostic_runs(id),UNIQUE(tenant_id,run_id,metric_code)
);
CREATE TABLE IF NOT EXISTS investment_cases (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,name TEXT NOT NULL,currency TEXT NOT NULL,discount_rate_bps INTEGER NOT NULL CHECK(discount_rate_bps>-10000 AND discount_rate_bps<=100000),status TEXT NOT NULL CHECK(status IN ('Rascunho','Calculado','Aprovado')),version_number INTEGER NOT NULL CHECK(version_number>0),npv_minor INTEGER,irr_bps INTEGER,payback_period INTEGER,input_hash TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,calculated_by TEXT,calculated_at TEXT,approved_by TEXT,approved_at TEXT,approval_hash TEXT,
 FOREIGN KEY(organization_id) REFERENCES organizations(id),UNIQUE(tenant_id,organization_id,name,version_number)
);
CREATE TABLE IF NOT EXISTS investment_cash_flows (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,case_id TEXT NOT NULL,period_number INTEGER NOT NULL CHECK(period_number BETWEEN 0 AND 100),amount_minor INTEGER NOT NULL,note TEXT,created_at TEXT NOT NULL,
 FOREIGN KEY(case_id) REFERENCES investment_cases(id),UNIQUE(tenant_id,case_id,period_number)
);
CREATE TABLE IF NOT EXISTS investment_sensitivities (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,case_id TEXT NOT NULL,rate_bps INTEGER NOT NULL,npv_minor INTEGER NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(case_id) REFERENCES investment_cases(id),UNIQUE(tenant_id,case_id,rate_bps)
);
CREATE INDEX IF NOT EXISTS diagnostic_run_scope_idx ON diagnostic_runs(tenant_id,organization_id,period,status);
CREATE INDEX IF NOT EXISTS investment_case_scope_idx ON investment_cases(tenant_id,organization_id,status);

CREATE TRIGGER IF NOT EXISTS diagnostic_role_guard BEFORE INSERT ON diagnostic_line_roles WHEN NOT EXISTS(SELECT 1 FROM financial_line_catalog l WHERE l.id=NEW.line_id AND l.tenant_id=NEW.tenant_id AND l.status='Ativa') BEGIN SELECT RAISE(ABORT,'invalid diagnostic line role'); END;
CREATE TRIGGER IF NOT EXISTS diagnostic_config_guard BEFORE INSERT ON diagnostic_metric_configs WHEN NOT EXISTS(SELECT 1 FROM diagnostic_frameworks f WHERE f.id=NEW.framework_id AND f.tenant_id=NEW.tenant_id AND f.status='Rascunho') BEGIN SELECT RAISE(ABORT,'diagnostic framework is not editable'); END;
CREATE TRIGGER IF NOT EXISTS diagnostic_rule_guard BEFORE INSERT ON diagnostic_rules WHEN length(NEW.recommendation)<10 OR NOT EXISTS(SELECT 1 FROM diagnostic_metric_configs c JOIN diagnostic_frameworks f ON f.id=c.framework_id AND f.tenant_id=c.tenant_id WHERE c.framework_id=NEW.framework_id AND c.tenant_id=NEW.tenant_id AND c.metric_code=NEW.metric_code AND f.status='Rascunho') BEGIN SELECT RAISE(ABORT,'invalid diagnostic rule'); END;
CREATE TRIGGER IF NOT EXISTS diagnostic_framework_transition BEFORE UPDATE ON diagnostic_frameworks
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.name<>OLD.name OR COALESCE(NEW.description,'')<>COALESCE(OLD.description,'') OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NOT ((OLD.status='Rascunho' AND NEW.status='Ativo' AND (SELECT COALESCE(SUM(weight_bps),0) FROM diagnostic_metric_configs c WHERE c.tenant_id=OLD.tenant_id AND c.framework_id=OLD.id)=10000 AND NOT EXISTS(SELECT 1 FROM diagnostic_metric_configs c WHERE c.tenant_id=OLD.tenant_id AND c.framework_id=OLD.id AND NOT EXISTS(SELECT 1 FROM diagnostic_rules r WHERE r.tenant_id=c.tenant_id AND r.framework_id=c.framework_id AND r.metric_code=c.metric_code))) OR (OLD.status='Ativo' AND NEW.status='Arquivado'))
BEGIN SELECT RAISE(ABORT,'invalid diagnostic framework transition'); END;
CREATE TRIGGER IF NOT EXISTS diagnostic_result_guard BEFORE INSERT ON diagnostic_results WHEN NOT EXISTS(SELECT 1 FROM diagnostic_runs r WHERE r.id=NEW.run_id AND r.tenant_id=NEW.tenant_id AND r.status='Calculado') BEGIN SELECT RAISE(ABORT,'invalid diagnostic result'); END;
CREATE TRIGGER IF NOT EXISTS diagnostic_result_immutable_update BEFORE UPDATE ON diagnostic_results BEGIN SELECT RAISE(ABORT,'diagnostic results are immutable'); END;
CREATE TRIGGER IF NOT EXISTS diagnostic_result_no_delete BEFORE DELETE ON diagnostic_results BEGIN SELECT RAISE(ABORT,'diagnostic results cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS diagnostic_run_transition BEFORE UPDATE ON diagnostic_runs WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.organization_id<>OLD.organization_id OR NEW.framework_id<>OLD.framework_id OR NEW.period<>OLD.period OR NEW.currency<>OLD.currency OR NEW.run_number<>OLD.run_number OR NEW.overall_score_bps<>OLD.overall_score_bps OR NEW.input_hash<>OLD.input_hash OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NOT (OLD.status='Calculado' AND NEW.status='Aprovado' AND NEW.approval_hash IS NOT NULL) BEGIN SELECT RAISE(ABORT,'invalid diagnostic run transition'); END;
CREATE TRIGGER IF NOT EXISTS diagnostic_run_no_delete BEFORE DELETE ON diagnostic_runs BEGIN SELECT RAISE(ABORT,'diagnostic runs cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS investment_flow_guard BEFORE INSERT ON investment_cash_flows WHEN NOT EXISTS(SELECT 1 FROM investment_cases c WHERE c.id=NEW.case_id AND c.tenant_id=NEW.tenant_id AND c.status='Rascunho') BEGIN SELECT RAISE(ABORT,'investment case is not editable'); END;
CREATE TRIGGER IF NOT EXISTS investment_flow_immutable_update BEFORE UPDATE ON investment_cash_flows BEGIN SELECT RAISE(ABORT,'investment cash flows are immutable'); END;
CREATE TRIGGER IF NOT EXISTS investment_sensitivity_guard BEFORE INSERT ON investment_sensitivities WHEN NOT EXISTS(SELECT 1 FROM investment_cases c WHERE c.id=NEW.case_id AND c.tenant_id=NEW.tenant_id AND c.status='Rascunho') BEGIN SELECT RAISE(ABORT,'invalid investment sensitivity'); END;
CREATE TRIGGER IF NOT EXISTS investment_case_transition BEFORE UPDATE ON investment_cases
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.organization_id<>OLD.organization_id OR NEW.name<>OLD.name OR NEW.currency<>OLD.currency OR NEW.discount_rate_bps<>OLD.discount_rate_bps OR NEW.version_number<>OLD.version_number OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NOT ((OLD.status='Rascunho' AND NEW.status='Calculado' AND NEW.npv_minor IS NOT NULL AND NEW.irr_bps IS NOT NULL AND NEW.input_hash IS NOT NULL) OR (OLD.status='Calculado' AND NEW.status='Aprovado' AND NEW.approval_hash IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'invalid investment case transition'); END;
CREATE TRIGGER IF NOT EXISTS investment_case_no_delete BEFORE DELETE ON investment_cases BEGIN SELECT RAISE(ABORT,'investment cases cannot be deleted'); END;
