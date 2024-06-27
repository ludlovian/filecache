-------------------------------------
-- Cache File Database
-------------------------------------

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-------------------------------------
-- tFile
--
-- Holds a record for eacached file
-- with the path and etag,

-- The etag is usually a size-mtime weak match
-- but has two other meanings
--
--  - NULL is used to show that the file does not
--    exist and saves a FS lookup
--  - 'updating' is used to show that some other
--    thread is currently writing this resource
--    to the cache, but is not yet ready to be used


CREATE TABLE IF NOT EXISTS
  t_File (
    id      INTEGER PRIMARY KEY,
    path    TEXT NOT NULL UNIQUE,
    etag    TEXT
  );

-------------------------------------
-- tFilePart
--
-- Holds the parts of the file to be assembled in
-- order to get the contents

CREATE TABLE IF NOT EXISTS
  t_FileContent (
    id      INTEGER,
    ix      INTEGER,
    data    BLOB,
    PRIMARY KEY (id, ix),
    FOREIGN KEY (id) REFERENCES t_File(id)
  );

-------------------------------------
-- Views
--

-- vw_File
--
-- To check if a file exists with the right etag

DROP VIEW IF EXISTS vw_File;
CREATE VIEW vw_File (path, etag) AS
    SELECT  path,
            etag
    FROM    t_File;


-- vw_FileContent
--
-- To read the content of a file

DROP VIEW IF EXISTS vw_FileContent;
CREATE VIEW vw_FileContent (path, ix, data) AS
    SELECT  f.path,
            c.ix,
            c.data
    FROM    t_File f
    JOIN    t_FileContent c
      ON    f.id = c.id
    ORDER BY
            f.path,
            c.ix;

-------------------------------------
-- Stored procedures
--

-- sp_removeFile
--
-- Removes an old or outdated cached file

DROP VIEW IF EXISTS sp_removeFile;
CREATE VIEW sp_removeFile(path) AS
  SELECT 0
  WHERE 0;

CREATE TRIGGER sp_removeFile_t
  INSTEAD OF INSERT ON sp_removeFile
BEGIN
  DELETE FROM t_FileContent
    WHERE id IN (
      SELECT  id
        FROM  t_File
        WHERE path = NEW.path
      );

  DELETE FROM t_File
    WHERE   path = NEW.path;

END;


-- sp_addFilePart
--
-- Called continually to add sequential parts of
-- a-file to the database.

-- Adds the record to t_File if needed and
-- sets the etag to updating

-- Sets the index to the next number

DROP VIEW IF EXISTS sp_addFilePart;
CREATE VIEW sp_addFilePart(path, data) AS
  SELECT 0, 0
  WHERE 0;

CREATE TRIGGER sp_addFilePart_t
  INSTEAD OF INSERT ON sp_addFilePart
BEGIN
  INSERT OR IGNORE
    INTO  t_File (path)
    VALUES (NEW.path);

  UPDATE  t_File
    SET   etag = 'updating'
    WHERE path = NEW.path
    AND   etag IS NOT 'updating';

  INSERT INTO t_FileContent (id, ix, data)
    SELECT  f.id,
            1 + IFNULL(MAX(c.ix), 0),
            NEW.data
    FROM    t_file f
    LEFT JOIN t_FileContent c
        ON c.id = f.id
    WHERE   f.path = NEW.path;

END;

-- sp_updateFile
--
-- Called at the end of inserts to set the etag, or called
-- to set the etag to null if the file doesn't exist

DROP VIEW IF EXISTS sp_updateFile;
CREATE VIEW sp_updateFile(path, etag) AS
  SELECT 0, 0
  WHERE 0;

CREATE TRIGGER sp_updateFile_t
  INSTEAD OF INSERT ON sp_updateFile
BEGIN

  INSERT INTO t_File (path, etag)
    VALUES (NEW.path, NEW.etag)
  ON CONFLICT (path) DO UPDATE
    SET etag = NEW.etag;

END;

-------------------------------------
-- Clean mid-transaction data

DELETE FROM t_FileContent
  WHERE id IN (
    SELECT  id
    FROM    t_File
    WHERE   etag = 'updating'
  );

DELETE FROM t_File
  WHERE etag = 'updating';

COMMIT;
