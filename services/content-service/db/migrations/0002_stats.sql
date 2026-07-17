CREATE TABLE user_stats (
  user_id uuid PRIMARY KEY,
  total_topics int NOT NULL,
  completed_topics int NOT NULL,
  streak_days int NOT NULL,
  due_histogram jsonb NOT NULL,
  subject_coverage jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE user_activity (
  user_id uuid NOT NULL,
  day date NOT NULL,
  revisions int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
