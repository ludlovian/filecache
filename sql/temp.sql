-----------------------------------------------------------
--
-- Cache File Temp Database
--
-- Holds the stored procedures and
-- transient views
--
-----------------------------------------------------------

-----------------------------------------------------------
--
-- vFileContent
--
-- The content of a cached file
--

CREATE TEMP VIEW vFileContent AS
  SELECT path, data FROM FileContent;

-----------------------------------------------------------
--
-- Stored procedures to update and delete data
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

-- vim: ts=2:sts=2:sw=2:et
