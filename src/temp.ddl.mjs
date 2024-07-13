export default `
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
-- Views used by the program

CREATE TEMP VIEW viewRealFiles AS
  SELECT path, mtime, size
  FROM viewFile
  WHERE missing is false
  ORDER BY path;

-----------------------------------------------------------
--
-- Clearing data
--

CREATE TEMP VIEW removeFile(path) AS SELECT 0 WHERE 0;
CREATE TEMP TRIGGER removeFile_t
  INSTEAD OF INSERT ON removeFile
BEGIN
  DELETE FROM FileChunk
    WHERE fileId IN (
      SELECT fileId FROM File WHERE path = NEW.path
    );
  DELETE FROM File WHERE path = NEW.path;
END;

CREATE TEMP VIEW removeFileChunks(path) AS SELECT 0 WHERE 0;
CREATE TEMP TRIGGER removeFileChunks_t
  INSTEAD OF INSERT ON removeFileChunks
BEGIN
  DELETE FROM FileChunk
    WHERE fileId IN (
      SELECT fileId FROM File WHERE path = NEW.path
    );
END;

CREATE TEMP VIEW resetCache(unused) AS SELECT 0 WHERE 0;
CREATE TEMP TRIGGER resetCache_t
  INSTEAD OF INSERT ON resetCache
BEGIN
  DELETE FROM FileChunk;
  DELETE FROM File;
END;

-----------------------------------------------------------
--
-- Updating metadata
--
-- Clears contents if anything has changed
--

CREATE TEMP VIEW updateFile(path, mtime, size) AS SELECT 0, 0, 0 WHERE 0;
CREATE TEMP TRIGGER IF NOT EXISTS updateFile_t
  INSTEAD OF INSERT ON updateFile
BEGIN
  -- Delete any content where the file mtime/size has changed
  DELETE FROM FileChunk
    WHERE fileId IN (
      SELECT fileId
        FROM File
        WHERE path = NEW.path
        AND (mtime, size) IS NOT (NEW.mtime, NEW.size)
    );
  -- Update the content where new or the mtime/size is different
  INSERT INTO File (path, mtime, size)
    VALUES (NEW.path, NEW.mtime, NEW.size)
    ON CONFLICT (path) DO UPDATE
      SET (mtime, size) = (NEW.mtime, NEW.size)
      WHERE (mtime, size) IS NOT (NEW.mtime, NEW.size);
END;

-----------------------------------------------------------
--
-- Adding a chunk of content
--
--

CREATE TEMP VIEW addFileChunk(path, seq, data) AS SELECT 0, 0 WHERE 0;
CREATE TEMP TRIGGER addFileChunk_t
  INSTEAD OF INSERT ON addFileChunk
BEGIN
  INSERT OR REPLACE INTO FileChunk (fileId, seq, data)
    SELECT fileId, NEW.seq, NEW.data
      FROM File
      WHERE path = NEW.path;
END;

-- vim: ft=sql ts=2:sts=2:sw=2:et
`
