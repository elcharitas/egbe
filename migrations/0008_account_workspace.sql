CREATE TABLE learner_workspaces (
  account_id TEXT PRIMARY KEY REFERENCES auth_accounts(id),
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  mutation_id TEXT,
  updated_at INTEGER NOT NULL
);
