CREATE TABLE IF NOT EXISTS distribution_batches (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  total_leads          INTEGER NOT NULL,
  selected_reps_count  INTEGER NOT NULL,
  split_type           TEXT NOT NULL CHECK (split_type IN ('equal', 'custom')),
  daily_target         INTEGER NOT NULL DEFAULT 40,
  deadline             TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS distribution_batch_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      INTEGER NOT NULL REFERENCES distribution_batches(id) ON DELETE CASCADE,
  rep_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_count INTEGER NOT NULL,
  daily_target  INTEGER NOT NULL DEFAULT 40,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dist_batch_items_rep ON distribution_batch_items(rep_id, created_at);
