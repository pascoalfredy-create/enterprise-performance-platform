CREATE TABLE IF NOT EXISTS subscription_change_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('Upgrade','Downgrade','Cancelamento','Apoio comercial')),
  requested_bundle TEXT,
  reason TEXT NOT NULL CHECK(length(reason) >= 10),
  status TEXT NOT NULL CHECK(status IN ('Pendente','Em análise','Aprovado','Rejeitado','Concluído')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_change_open_guard
ON subscription_change_requests(tenant_id, request_type)
WHERE status IN ('Pendente','Em análise');

CREATE INDEX IF NOT EXISTS subscription_change_tenant_time
ON subscription_change_requests(tenant_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS activation_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  checkpoint_code TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK(length(evidence) >= 5),
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(tenant_id, checkpoint_code)
);

CREATE TRIGGER IF NOT EXISTS subscription_change_no_delete
BEFORE DELETE ON subscription_change_requests
BEGIN SELECT RAISE(ABORT,'subscription change requests cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS activation_evidence_no_update
BEFORE UPDATE ON activation_evidence
BEGIN SELECT RAISE(ABORT,'activation evidence is immutable'); END;

CREATE TRIGGER IF NOT EXISTS activation_evidence_no_delete
BEFORE DELETE ON activation_evidence
BEGIN SELECT RAISE(ABORT,'activation evidence is immutable'); END;
