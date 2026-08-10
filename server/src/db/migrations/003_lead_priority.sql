ALTER TABLE leads ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal'
  CHECK (priority IN ('Hot', 'Warm', 'Normal', 'Cold'));
