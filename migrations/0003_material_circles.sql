CREATE TABLE study_circles (
  id TEXT PRIMARY KEY,
  owner TEXT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  description TEXT NOT NULL CHECK (length(description) <= 300),
  created_at INTEGER NOT NULL
);

INSERT INTO study_circles (id, owner, title, description, created_at)
VALUES (
  '3ea517f0-1661-45d5-84bf-3797090dd75a',
  NULL,
  'Community study circle',
  'Bring something you want to understand. Study it together.',
  0
);

CREATE TABLE circle_members (
  circle_id TEXT NOT NULL REFERENCES study_circles(id),
  owner TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (circle_id, owner)
);

CREATE TABLE study_materials (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES study_circles(id),
  owner TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  source_url TEXT,
  attribution TEXT NOT NULL CHECK (length(attribution) BETWEEN 1 AND 160),
  text TEXT NOT NULL CHECK (length(text) <= 12000),
  created_at INTEGER NOT NULL,
  removed_at INTEGER
);

CREATE INDEX study_materials_circle
ON study_materials(circle_id, created_at DESC);
CREATE INDEX study_materials_owner
ON study_materials(owner, created_at);

ALTER TABLE check_ins ADD COLUMN circle_id TEXT NOT NULL
DEFAULT '3ea517f0-1661-45d5-84bf-3797090dd75a';
ALTER TABLE check_ins ADD COLUMN material_id TEXT;
CREATE INDEX check_ins_circle ON check_ins(circle_id, created_at DESC);

INSERT INTO circle_members (circle_id, owner, joined_at)
SELECT '3ea517f0-1661-45d5-84bf-3797090dd75a', owner, MIN(created_at)
FROM check_ins GROUP BY owner;
