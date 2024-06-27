-------------------------------------
-- Cache a part of a file

INSERT INTO sp_addFilePart (path, data)
    VALUES (:path, :data);
