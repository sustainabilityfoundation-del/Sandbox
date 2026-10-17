-- AI usage ledger and pricing registry (AI infrastructure increment A, ADR-0079; brief section 8.2).
-- usage_events is INSERT-ONLY: a trigger refuses UPDATE and DELETE; mistakes are fixed by compensating
-- 'correction' rows. Money is numeric(20,10) (strings on the wire, decimal.js in code). No prompt or response
-- text is stored here, by design. Additive migration; schemas 0001 and 0002 are unchanged.
-- context_id (ECII plan Amendment 2) is deliberately NOT here: it arrives in migration 0004 (increment C).

CREATE TABLE assistant.pricing (
  provider text NOT NULL,
  model text NOT NULL,                 -- model ID or '*' pattern
  pricing_version text NOT NULL,
  service_tier text NOT NULL DEFAULT 'standard',
  context_band jsonb,                  -- { label, minInputTokens?, maxInputTokens? }
  variant text NOT NULL DEFAULT 'standard|',   -- service tier and band label: part of the key
  effective_from date NOT NULL,
  currency text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  placeholder boolean NOT NULL DEFAULT false,
  source_url text,
  retrieved_at text,
  source_version text,
  rates jsonb NOT NULL,                -- { dimension: { price, per } | { tiers, per } }
  discounts jsonb NOT NULL DEFAULT '[]',
  note text,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, model, pricing_version, variant)
);

CREATE TABLE assistant.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  event text NOT NULL CHECK (event IN ('started', 'completed', 'failed', 'cancelled', 'correction')),
  request_id text NOT NULL,
  operation_id text NOT NULL,
  workflow_id text,
  organization_id text,
  user_id text,
  project_id text,
  module_id text,
  conversation_id text,
  provider text NOT NULL,
  model text NOT NULL,
  -- Where the credential came from, and who pays.
  source text NOT NULL CHECK (source IN ('developer-key', 'user-connection', 'mock')),
  billing text NOT NULL CHECK (billing IN ('meter_only', 'byok', 'consumer-plan', 'mock')),
  simulated boolean NOT NULL DEFAULT false,
  -- Usage. Corrections carry signed deltas; every other event is non-negative.
  input_tokens bigint,
  output_tokens bigint,
  cached_input_tokens bigint,
  cache_write_tokens bigint,
  cache_write_1h_tokens bigint,        -- subset of cache_write_tokens with the long cache lifetime
  reasoning_tokens bigint,
  units jsonb NOT NULL DEFAULT '[]',   -- [{ dimension, quantity }] for non-token billing
  provider_usage_details jsonb,        -- the provider's usage object, numbers only
  usage_reported text NOT NULL DEFAULT 'none' CHECK (usage_reported IN ('provider', 'estimated', 'none')),
  -- Money.
  currency text NOT NULL DEFAULT 'USD',
  estimated_provider_cost numeric(20,10),
  actual_provider_cost numeric(20,10),
  reserved_cost numeric(20,10),
  credits_charged numeric(20,10),
  pricing_version text,
  rates_used jsonb,                    -- snapshot of the rates, so the cost is reproducible
  accounting_status text NOT NULL DEFAULT 'estimated' CHECK (accounting_status IN ('estimated', 'provisional', 'settled', 'reconciled')),
  corrects_event_id uuid REFERENCES assistant.usage_events (id),
  payload_hash text NOT NULL,          -- sha256 of the event content: a replay with other content under the same key is refused
  reason text,                         -- short reason for a correction; never request content
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Bring-your-own-key and consumer-plan usage is not consumed from the platform: it never carries credits.
  CONSTRAINT usage_events_no_credits_for_byok CHECK (credits_charged IS NULL OR billing NOT IN ('byok', 'consumer-plan')),
  CONSTRAINT usage_events_source_billing_mock CHECK ((source = 'mock') = (billing = 'mock')),
  CONSTRAINT usage_events_mock_is_simulated CHECK (billing <> 'mock' OR simulated),
  CONSTRAINT usage_events_correction_target CHECK ((event = 'correction') = (corrects_event_id IS NOT NULL)),
  CONSTRAINT usage_events_non_negative CHECK (
    event = 'correction' OR (
      COALESCE(input_tokens, 0) >= 0 AND COALESCE(output_tokens, 0) >= 0 AND COALESCE(cached_input_tokens, 0) >= 0
      AND COALESCE(cache_write_tokens, 0) >= 0 AND COALESCE(cache_write_1h_tokens, 0) >= 0 AND COALESCE(reasoning_tokens, 0) >= 0
      AND COALESCE(estimated_provider_cost, 0) >= 0 AND COALESCE(actual_provider_cost, 0) >= 0 AND COALESCE(reserved_cost, 0) >= 0
    )
  )
);
CREATE INDEX usage_events_conversation ON assistant.usage_events (conversation_id, occurred_at) WHERE conversation_id IS NOT NULL;
CREATE INDEX usage_events_operation ON assistant.usage_events (operation_id);
CREATE INDEX usage_events_request ON assistant.usage_events (request_id);
CREATE INDEX usage_events_period ON assistant.usage_events (occurred_at);
CREATE INDEX usage_events_project ON assistant.usage_events (project_id, occurred_at) WHERE project_id IS NOT NULL;

CREATE FUNCTION assistant.usage_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assistant.usage_events is insert-only; add a correction row instead' USING ERRCODE = 'restrict_violation';
END
$$;
CREATE TRIGGER usage_events_no_update BEFORE UPDATE OR DELETE ON assistant.usage_events
  FOR EACH ROW EXECUTE FUNCTION assistant.usage_events_immutable();
CREATE TRIGGER usage_events_no_truncate BEFORE TRUNCATE ON assistant.usage_events
  FOR EACH STATEMENT EXECUTE FUNCTION assistant.usage_events_immutable();
