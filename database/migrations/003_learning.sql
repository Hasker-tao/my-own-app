-- A small personal learning workspace; updates are transactional and backups include this row.
CREATE TABLE learning_workspace (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
