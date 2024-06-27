---------------------------------------
--
-- Finds a file based on a given path

SELECT  etag
  FROM  vw_File
  WHERE path = :path;
