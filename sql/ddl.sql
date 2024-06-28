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
-- with the path and metadata

-- Also holds a flag for status, with the following meaning
--   - 0 NOTEXIST   - the file does not exist
--   - 1 METADATA   - we have metadata but no contents
--                    if we read, we should add the contents
--   - 2 UPDATING   - we have metadata, and somebody is already
--                    updating the contents (we hope)
--   - 3 CACHED     - we have the contents


CREATE TABLE IF NOT EXISTS
  t_File (
    id      INTEGER PRIMARY KEY,
    path    TEXT NOT NULL UNIQUE,
    status  INT NOT NULL,
    mtime   INT,
    size    INT
  );

-------------------------------------
-- tFilePart
--
-- Holds the parts of the file to be assembled in
-- order to get the contents

CREATE TABLE IF NOT EXISTS
  t_FileContent (
    id      INTEGER NOT NULL,
    ix      INTEGER NOT NULL,
    data    BLOB NOT NULL,
    PRIMARY KEY (id, ix),
    FOREIGN KEY (id) REFERENCES t_File(id) ON DELETE CASCADE
  );

-------------------------------------
-- Views
--

-- vw_File
--
-- To check if a file exists with the right etag

DROP VIEW IF EXISTS vw_File;
CREATE VIEW vw_File AS
    SELECT  path,
            status,
            mtime,
            size
    FROM    t_File;


-- vw_FileContent
--
-- To read the content of a file

DROP VIEW IF EXISTS vw_FileContent;
CREATE VIEW vw_FileContent (data, path, ix) AS
    SELECT  c.data,
            f.path,
            c.ix
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

  -- Set the file status to UPDATING
  UPDATE  t_File
    SET   status = 2
    WHERE path = NEW.path
    AND   status != 2;

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
-- Called to set the metadata, including existence status

DROP VIEW IF EXISTS sp_updateFile;
CREATE VIEW sp_updateFile(path, status, mtime, size) AS
  SELECT 0, 0, 0, 0
  WHERE 0;

CREATE TRIGGER sp_updateFile_t
  INSTEAD OF INSERT ON sp_updateFile
BEGIN

  INSERT INTO t_File (
        path,
        status,
        mtime,
        size
    )
    VALUES (
        NEW.path,
        NEW.status,
        NEW.mtime,
        NEW.size
    )
  ON CONFLICT (path) DO UPDATE
    SET (status, mtime, size) =
          (NEW.status, NEW.mtime, NEW.size);

END;

-- sp_reset
--
-- Called to clear the whole cache
DROP VIEW IF EXISTS sp_reset;
CREATE VIEW sp_reset(unused) AS
  SELECT 0
  WHERE 0;

CREATE TRIGGER sp_reset_t
  INSTEAD OF INSERT ON sp_reset
BEGIN

  DELETE FROM t_File;

END;


-------------------------------------
-- Clean mid-transaction data

DELETE FROM t_File
  WHERE status = 2;

COMMIT;

VACUUM;
