ALTER TABLE module_documents ADD COLUMN ocr_provider TEXT;
ALTER TABLE module_documents ADD COLUMN ocr_processed_at TEXT;
ALTER TABLE module_documents ADD COLUMN ocr_validated_payload_json TEXT;

CREATE TABLE IF NOT EXISTS document_ocr_events (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 document_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('Processado','Falhou','Validado')),
 provider TEXT,
 confidence_bps INTEGER CHECK(confidence_bps BETWEEN 0 AND 10000),
 payload_hash TEXT,
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(document_id) REFERENCES module_documents(id)
);

CREATE INDEX IF NOT EXISTS document_ocr_events_scope_idx
 ON document_ocr_events(tenant_id,document_id,created_at);

CREATE TRIGGER IF NOT EXISTS document_ocr_event_guard BEFORE INSERT ON document_ocr_events
WHEN NOT EXISTS(SELECT 1 FROM module_documents d WHERE d.id=NEW.document_id AND d.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'ocr event outside tenant'); END;

CREATE TRIGGER IF NOT EXISTS document_ocr_event_immutable_update BEFORE UPDATE ON document_ocr_events
BEGIN SELECT RAISE(ABORT,'ocr events are immutable'); END;

CREATE TRIGGER IF NOT EXISTS document_ocr_event_no_delete BEFORE DELETE ON document_ocr_events
BEGIN SELECT RAISE(ABORT,'ocr events cannot be deleted'); END;
