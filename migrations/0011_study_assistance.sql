-- A reserved ID is never deleted: failed and uncertain calls still count.
CREATE TABLE study_assistance (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_accounts(id),
  material_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 1000),
  excerpt TEXT NOT NULL CHECK (length(excerpt) BETWEEN 1 AND 6000),
  answer TEXT CHECK (answer IS NULL OR length(answer) BETWEEN 1 AND 8000),
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  created_at INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX study_assistance_account_material
ON study_assistance(account_id, material_id, created_at DESC, id DESC);
CREATE INDEX study_assistance_account_time
ON study_assistance(account_id, created_at DESC);
CREATE INDEX study_assistance_time
ON study_assistance(created_at DESC);
