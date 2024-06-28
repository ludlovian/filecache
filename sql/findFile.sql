---------------------------------------
--
-- Finds a file based on a given path

SELECT  status,
        mtime,
        size,
        ctype
  FROM  vw_File
  WHERE path = :path;
