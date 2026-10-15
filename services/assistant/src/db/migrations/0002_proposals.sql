-- Persisted proposals (integration milestone 1 C9, ADR-0042). A proposal is versioned data: the preview the
-- person saw and, for declarative proposals, the module operations executed at Apply after revalidation.
-- Scoped to one project (C13) and one actor. Additive migration; schema 0001 is unchanged.

CREATE TABLE assistant.proposals (
  id uuid PRIMARY KEY,
  schema_version integer NOT NULL DEFAULT 1,
  project_id text NOT NULL,
  actor_id text NOT NULL,
  conversation_id text NOT NULL,
  message_id text,
  -- Key shown in the conversation (CP-3); unique per actor and conversation.
  key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('declarative', 'twin', 'closure')),
  module text NOT NULL,
  title text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  preview jsonb NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '[]',
  operations jsonb NOT NULL DEFAULT '[]',
  expected jsonb NOT NULL DEFAULT '[]',
  confirmation jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applying', 'applied', 'rejected', 'conflict', 'failed')),
  message text,
  -- One entry per executed operation: { index, status, httpStatus, summary, body }.
  results jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  UNIQUE (actor_id, conversation_id, key)
);
CREATE INDEX proposals_actor_project ON assistant.proposals (actor_id, project_id, status, created_at DESC);
