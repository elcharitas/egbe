ALTER TABLE oauth_transactions RENAME COLUMN return_invite TO return_invite_hash;

CREATE TABLE legacy_ownership_claims (
  legacy_owner TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_accounts(id),
  claimed_at INTEGER NOT NULL
);
