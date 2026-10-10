-- Existing circles and their content remain public.
ALTER TABLE study_circles ADD COLUMN visibility TEXT NOT NULL
  DEFAULT 'public' CHECK (visibility IN ('public', 'private'));
ALTER TABLE study_circles ADD COLUMN invite_hash TEXT;
CREATE UNIQUE INDEX study_circles_invite_hash
  ON study_circles(invite_hash);
