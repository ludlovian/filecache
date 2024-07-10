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
INSERT OR REPLACE INTO _Schema VALUES(0, 3);

-----------------------------------------------------------
-- File
--
-- Holds a record for each cached file

CREATE TABLE IF NOT EXISTS File (
  fileId  INTEGER PRIMARY KEY NOT NULL,
  path    TEXT NOT NULL UNIQUE,
  mtime   INTEGER,
  size    INTEGER
);

-----------------------------------------------------------
-- FileContent
--
-- Holds the contents of the file in chunks

CREATE TABLE IF NOT EXISTS FileChunk (
  fileId  INTEGER NOT NULL,
  seq     INTEGER NOT NULL,
  data    BLOB NOT NULL,
  PRIMARY KEY (fileId, seq),
  FOREIGN KEY (fileId) REFERENCES File
);

-----------------------------------------------------------
--
-- viewFile
--
-- The cached details of a file
--

CREATE VIEW IF NOT EXISTS viewFile AS
  WITH cteCache AS (
    SELECT fileId, sum(length(data)) AS cSize, count(*) as chunks
    FROM FileChunk
    GROUP BY fileId
  )
  SELECT
    a.path,
    a.mtime,
    a.size,
    a.size IS NULL AS missing,
    b.cSize = a.size AS cached,
    b.chunks
  FROM File a
  LEFT JOIN cteCache b USING(fileId);

-----------------------------------------------------------
--
-- viewFilePart
--
-- A cached chunk of a file
--
CREATE VIEW IF NOT EXISTS viewFileChunk AS
  SELECT
    a.path,
    b.seq,
    a.mtime,
    a.size,
    b.data
  FROM File a
  JOIN FileChunk b USING (fileId);

COMMIT;
VACUUM;

-- vim: ts=2:sts=2:sw=2:et
