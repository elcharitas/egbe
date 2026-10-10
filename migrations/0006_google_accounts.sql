CREATE TABLE auth_accounts (
  id TEXT PRIMARY KEY CHECK (length(id) = 64),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE oauth_transactions (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_transactions_expiry ON oauth_transactions(expires_at);

CREATE TABLE auth_sessions (
  session_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_accounts(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX auth_sessions_account ON auth_sessions(account_id, expires_at);
