-- Assistant service (docs/specifications/ai-connection.md §3, §5). Credentials are stored only as
-- AES-256-GCM ciphertext (key from the server environment); they are never returned to the browser
-- and never logged. Audit records hold no credentials and no prompts unless the person turns on
-- prompt storage for debugging.

-- One stable, opaque host identifier for this installation (Sign in with ChatGPT ext_agent_host_id).
CREATE TABLE assistant.host (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  host_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The active account connection of a platform user (one per user).
CREATE TABLE assistant.connections (
  id uuid PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  provider text NOT NULL,
  method text NOT NULL,
  -- Display only: "key ending abcd", the account email.
  account_label text NOT NULL,
  key_last4 text,
  account_subject text,
  client_id text,
  scopes text[] NOT NULL DEFAULT '{}',
  secret_ciphertext bytea NOT NULL,
  access_expires_at timestamptz,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs-sign-in', 'plan-usage-disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz
);

-- OAuth registrations kept after sign-out (issued client ID, account identity) for a later sign-in.
CREATE TABLE assistant.oauth_registrations (
  user_id text NOT NULL,
  provider text NOT NULL,
  account_subject text NOT NULL,
  account_email text,
  client_id text NOT NULL,
  id_token_ciphertext bytea,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider, account_subject)
);

-- Authorization attempts in progress (state, nonce and PKCE verifier stay on the server).
CREATE TABLE assistant.oauth_attempts (
  state text PRIMARY KEY,
  user_id text NOT NULL,
  provider text NOT NULL,
  method text NOT NULL,
  secret_ciphertext bytea NOT NULL,
  redirect_uri text NOT NULL,
  return_to text NOT NULL,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One record per model call.
CREATE TABLE assistant.audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id text NOT NULL,
  project_id text,
  provider text NOT NULL,
  method text,
  model text,
  purpose text NOT NULL DEFAULT 'assistant',
  tools_offered integer NOT NULL DEFAULT 0,
  tools_called text[] NOT NULL DEFAULT '{}',
  tools_refused text[] NOT NULL DEFAULT '{}',
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  outcome text NOT NULL,
  error_code text,
  prompt jsonb
);
CREATE INDEX audit_user_at ON assistant.audit (user_id, at DESC);
