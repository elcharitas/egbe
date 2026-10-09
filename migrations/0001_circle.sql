CREATE TABLE check_ins (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('web', 'numbers')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 600),
  created_at INTEGER NOT NULL
);

CREATE INDEX check_ins_recent ON check_ins(created_at DESC);
CREATE INDEX check_ins_owner ON check_ins(owner, created_at);
