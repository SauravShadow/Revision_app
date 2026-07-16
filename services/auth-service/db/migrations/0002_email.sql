ALTER TABLE users
  ADD COLUMN email text,
  ADD COLUMN email_lower text GENERATED ALWAYS AS (lower(email)) STORED,
  ADD COLUMN email_verified_at timestamptz;

CREATE UNIQUE INDEX users_email_lower_idx ON users (email_lower) WHERE email_lower IS NOT NULL;

CREATE TABLE email_verification_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
