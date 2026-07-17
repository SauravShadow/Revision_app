CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE org_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES org_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'head', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT: org-level rows (group_id IS NULL) must also be unique.
  UNIQUE NULLS NOT DISTINCT (org_id, group_id, user_id)
);

CREATE INDEX org_memberships_user_idx ON org_memberships (user_id);
CREATE INDEX org_memberships_group_idx ON org_memberships (group_id);

CREATE TABLE invite_codes (
  code text PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
