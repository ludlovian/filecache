-------------------------------------
-- Cache File Database
-------------------------------------

PRAGMA foreign_keys=ON;
BEGIN TRANSACTION;

-------------------------------------
--
-- Holds the schema number
--
-- UPDATE BOTH LINES WHEN SCHEMA CHANGES
--
CREATE TABLE IF NOT EXISTS _Schema (version INTEGER NOT NULL);
INSERT INTO _Schema SELECT 2 WHERE NOT EXISTS (SELECT * FROM _Schema);
CREATE VIEW IF NOT EXISTS _vSchema(valid) AS
  SELECT version = 2 FROM _Schema;

-------------------------------------
-- File
--
-- Holds a record for each cached file

CREATE TABLE IF NOT EXISTS File (
  path    TEXT NOT NULL PRIMARY KEY,
  mtime   INTEGER,
  size    INTEGER
);

-------------------------------------
-- FileContent
--
-- Holds the contents of the file

CREATE TABLE IF NOT EXISTS FileContent (
  path    TEXT NOT NULL PRIMARY KEY,
  data    BLOB NOT NULL,
  FOREIGN KEY (path) REFERENCES File(path) ON DELETE CASCADE
);

-------------------------------------
-- Views
--

-- vFile
--
-- to receive metadata about each file

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

-------------------------------------
-- Stored procedures
--

CREATE TEMP VIEW spRemoveFile(path) AS SELECT 0 WHERE 0;
CREATE TEMP TRIGGER sptRemoveFile
  INSTEAD OF INSERT ON spRemoveFile
BEGIN
  DELETE FROM File WHERE path = NEW.path;
END;

CREATE TEMP VIEW spAddFileContent(path, data) AS SELECT 0, 0 WHERE 0;
CREATE TEMP TRIGGER sptAddFileContent
  INSTEAD OF INSERT ON spAddFileContent
BEGIN
  INSERT OR IGNORE INTO File (path) VALUES (NEW.path);
  INSERT OR REPLACE INTO FileContent (path, data)
    VALUES(NEW.path, NEW.data);
END;

CREATE TEMP VIEW spUpdateFile(path, mtime, size) AS SELECT 0, 0, 0 WHERE 0;
CREATE TEMP TRIGGER IF NOT EXISTS sptUpdateFile
  INSTEAD OF INSERT ON spUpdateFile
BEGIN
  INSERT OR REPLACE INTO File (path, mtime, size)
    VALUES (NEW.path, NEW.mtime, NEW.size);
END;

CREATE TEMP VIEW spReset(unused) AS SELECT 0 WHERE 0;
CREATE TEMP TRIGGER sptReset
  INSTEAD OF INSERT ON spReset
BEGIN
  DELETE FROM File;
END;

-------------------------------------

COMMIT;
VACUUM;

-- vim: ts=2:sts=2:sw=2:et
