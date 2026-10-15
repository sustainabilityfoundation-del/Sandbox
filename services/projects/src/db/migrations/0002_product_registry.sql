-- Product registry (ADR-0063, approved 15 October 2026): product/system/subsystem/assembly/part elements and
-- named breakdowns, owned by the product registry inside Project Management (module ID `product`). Additive only.
-- Element kinds are labels, not constraints. An element may appear in several breakdowns and under several
-- parents in one breakdown (a part used in two assemblies). Cycles within a breakdown are refused by the service.
-- Twin IDs of the example project (ACT-100, ROD-120 …) are aliases; their twin data is never changed.

CREATE TABLE projects.product_elements (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  key text NOT NULL CHECK (key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,39}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  element_kind text NOT NULL CHECK (element_kind IN ('product', 'system', 'subsystem', 'assembly', 'part', 'other')),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 20000),
  properties jsonb NOT NULL DEFAULT '{}',
  lifecycle text NOT NULL DEFAULT 'working' CHECK (lifecycle IN ('working', 'in-review', 'released', 'superseded', 'retired')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  source_kind text NOT NULL DEFAULT 'user',
  UNIQUE (project_id, key)
);

CREATE TABLE projects.product_element_revisions (
  element_id uuid NOT NULL REFERENCES projects.product_elements (id),
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL,
  changed_by text NOT NULL,
  summary text NOT NULL DEFAULT '',
  PRIMARY KEY (element_id, revision)
);
CREATE TRIGGER product_element_revisions_immutable BEFORE UPDATE OR DELETE ON projects.product_element_revisions FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();

CREATE TABLE projects.product_element_aliases (
  project_id text NOT NULL REFERENCES projects.projects (id),
  alias text NOT NULL,
  element_id uuid NOT NULL REFERENCES projects.product_elements (id),
  origin text NOT NULL DEFAULT 'twin',
  PRIMARY KEY (project_id, alias)
);
CREATE TRIGGER product_element_aliases_immutable BEFORE UPDATE OR DELETE ON projects.product_element_aliases FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();

CREATE TABLE projects.breakdowns (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  purpose text NOT NULL CHECK (purpose IN ('product-breakdown', 'physical-assembly', 'other')),
  description text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL
);
CREATE UNIQUE INDEX breakdowns_name ON projects.breakdowns (project_id, lower(name));

CREATE TABLE projects.breakdown_edges (
  id uuid PRIMARY KEY,
  breakdown_id uuid NOT NULL REFERENCES projects.breakdowns (id),
  parent_id uuid REFERENCES projects.product_elements (id),
  child_id uuid NOT NULL REFERENCES projects.product_elements (id),
  quantity numeric CHECK (quantity IS NULL OR quantity > 0),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  removed_at timestamptz,
  removed_by text,
  CHECK (parent_id IS NULL OR parent_id <> child_id)
);
-- A root edge has parent_id NULL. One active edge per (breakdown, parent, child).
CREATE UNIQUE INDEX breakdown_edges_active ON projects.breakdown_edges (breakdown_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), child_id) WHERE removed_at IS NULL;
CREATE INDEX breakdown_edges_parent ON projects.breakdown_edges (breakdown_id, parent_id) WHERE removed_at IS NULL;
