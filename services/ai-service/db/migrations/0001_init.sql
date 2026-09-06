CREATE TABLE ai_quota (
  user_id uuid NOT NULL,
  day     date NOT NULL,
  used    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE ai_usage (
  id             bigserial   PRIMARY KEY,
  user_id        uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  provider       text        NOT NULL,
  model          text        NOT NULL,
  operation      text        NOT NULL,
  input_tokens   int,
  output_tokens  int,
  latency_ms     int,
  outcome        text        NOT NULL,
  cards_proposed int,
  cards_kept     int
);

CREATE INDEX ai_usage_user_time ON ai_usage (user_id, created_at DESC);
