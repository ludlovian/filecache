-----------------------------------------------------------
-- Cache File Database
-----------------------------------------------------------

PRAGMA foreign_keys=ON;
BEGIN TRANSACTION;

-----------------------------------------------------------
--
-- Holds the schema number
--
CREATE TABLE IF NOT EXISTS _Schema (id INTEGER PRIMARY KEY CHECK(id = 0), version INTEGER NOT NULL);
INSERT OR REPLACE INTO _Schema VALUES(0, 2);

-----------------------------------------------------------
-- File
--
-- Holds a record for each cached file

CREATE TABLE IF NOT EXISTS File (
  path    TEXT NOT NULL PRIMARY KEY,
  mtime   INTEGER,
  size    INTEGER
) WITHOUT ROWID;

-----------------------------------------------------------
-- FileContent
--
-- Holds the contents of the file

CREATE TABLE IF NOT EXISTS FileContent (
  path    TEXT NOT NULL PRIMARY KEY,
  data    BLOB NOT NULL,
  FOREIGN KEY (path) REFERENCES File(path) ON DELETE CASCADE
) WITHOUT ROWID;

-----------------------------------------------------------
--
-- vFile
--
-- The cached details of a file
--

CREATE VIEW IF NOT EXISTS vFile
  (path, mtime, size, missing, cached) AS
  SELECT
    f.path,
    f.mtime,
    f.size,
    f.size IS NULL,
    COUNT(c.path) > 0
  FROM File f
  LEFT JOIN FileContent c USING(path)
  GROUP BY 1, 2, 3, 4;

COMMIT;
VACUUM;

-- vim: ts=2:sts=2:sw=2:et
