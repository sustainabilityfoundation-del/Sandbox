-- CAD service, migration 0002: outbox events describe the entity they announce, so that a consumer
-- (the Project Management artifact source, SDK 1.7) can list and describe CAD documents and parts
-- from events alone: kind, name and the part descriptors (stable UUID, document-local ID, name).
-- updatedAt / updatedBy are the existing occurred_at / actor columns.
-- Additive only: new nullable or defaulted columns; existing events keep their data and get the
-- document's current title as name (never rewritten afterwards). docs/modules/cad/service.md.

ALTER TABLE cad.outbox ADD COLUMN kind text NOT NULL DEFAULT 'cad-document';
ALTER TABLE cad.outbox ADD COLUMN name text;
ALTER TABLE cad.outbox ADD COLUMN parts jsonb;

UPDATE cad.outbox o SET name = d.title FROM cad.documents d WHERE o.document_id = d.id AND o.name IS NULL;
