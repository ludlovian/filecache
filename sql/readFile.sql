-----------------------------------------
-- Reads a file's cached content

SELECT  data
  FROM  vw_FileContent
  WHERE path = :path;
