-------------------------------------
-- updateFile
--
-- Updates a file with a new (or null) etag

INSERT INTO sp_updateFile (path, etag)
    VALUES (:path, :etag);
