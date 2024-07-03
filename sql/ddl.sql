-------------------------------------
-- Cache File Database
-------------------------------------

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-------------------------------------
-- t_Version
--
-- Holds the schema number
--
-- UPDATE BOTH LINES WHEN SCHEMA CHANGES
--
CREATE TABLE IF NOT EXISTS
  t_Schema (version INTEGER NOT NULL);

INSERT INTO t_Schema
  SELECT 1
  WHERE NOT EXISTS (SELECT * FROM t_Schema);

CREATE VIEW IF NOT EXISTS
  vw_Schema(valid) AS
    SELECT  version = 1
      FROM  t_Schema;

-------------------------------------
-- t_File
--
-- Holds a record for eacached file
-- with the path and metadata



CREATE TABLE IF NOT EXISTS
  t_File (
    id      INTEGER PRIMARY KEY NOT NULL,
    path    TEXT NOT NULL UNIQUE,
    mtime   INT,
    size    INT
  );

-------------------------------------
-- t_FileContent
--
-- Holds the contents of the file 
-- order to get the contents

CREATE TABLE IF NOT EXISTS
  t_FileContent (
    id      INTEGER PRIMARY KEY NOT NULL,
    data    BLOB NOT NULL,
    FOREIGN KEY (id) REFERENCES t_File(id) ON DELETE CASCADE
  );

-------------------------------------
-- Views
--

-- vw_File
--
-- to receive metadata about each file

CREATE VIEW IF NOT EXISTS
  vw_File(path, mtime, size, missing, cached) AS
    SELECT      f.path,
                f.mtime,
                f.size,
                f.size IS NULL,
                COUNT(c.id) > 0
    FROM        t_File f
    LEFT JOIN   t_FileContent c
                ON c.id = f.id
    GROUP BY    f.path;


-- vw_FileContent
--
-- To read the content of a file

CREATE VIEW IF NOT EXISTS
  vw_FileContent (data, path) AS
    SELECT  c.data,
            f.path
    FROM    t_File f
    JOIN    t_FileContent c
      ON    f.id = c.id;

-------------------------------------
-- Stored procedures
--

-- sp_removeFile
--
-- Removes an old or outdated cached file

CREATE VIEW IF NOT EXISTS
  sp_removeFile(path) AS
    SELECT 0
    WHERE 0;

CREATE TRIGGER IF NOT EXISTS sp_removeFile_t
  INSTEAD OF INSERT ON sp_removeFile
BEGIN
  DELETE FROM t_File
    WHERE   path = NEW.path;

END;


-- sp_addFileContent
--
-- Adds the record to t_File if needed

CREATE VIEW IF NOT EXISTS
  sp_addFileContent(path, data) AS
    SELECT 0, 0
    WHERE 0;

CREATE TRIGGER IF NOT EXISTS sp_addFileContent_t
  INSTEAD OF INSERT ON sp_addFileContent
BEGIN
  INSERT OR IGNORE
    INTO  t_File (path)
    VALUES (NEW.path);

  INSERT INTO t_FileContent (id, data)
      SELECT  f.id,
              NEW.data
      FROM    t_file f
      WHERE   f.path = NEW.path
    ON CONFLICT (id) DO UPDATE
      SET     data = NEW.data;

END;

-- sp_updateFile
--
-- Called to set the metadata, including existence status

CREATE VIEW IF NOT EXISTS
  sp_updateFile(path, mtime, size) AS
    SELECT 0, 0, 0
    WHERE 0;

CREATE TRIGGER IF NOT EXISTS sp_updateFile_t
  INSTEAD OF INSERT ON sp_updateFile
BEGIN

  INSERT INTO t_File
      (path, mtime, size)
    VALUES
      (NEW.path, NEW.mtime, NEW.size)
    ON CONFLICT (path) DO UPDATE
      SET (mtime, size) = (NEW.mtime, NEW.size);

END;

-- sp_reset
--
-- Called to clear the whole cache
CREATE VIEW IF NOT EXISTS
  sp_reset(unused) AS
    SELECT 0
    WHERE 0;

CREATE TRIGGER IF NOT EXISTS sp_reset_t
  INSTEAD OF INSERT ON sp_reset
BEGIN

  DELETE FROM t_File;

END;

-------------------------------------

COMMIT;
PRAGMA wal_checkpoint(truncate);
VACUUM;

-- vim: ts=2:sts=2:sw=2:et
