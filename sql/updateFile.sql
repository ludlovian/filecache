-------------------------------------
-- updateFile
--
-- Updates or inserts a file with metadata

INSERT INTO sp_updateFile (
        path,
        status,
        mtime,
        size,
        ctype
    )
    VALUES (
        :path,
        :status,
        :mtime,
        :size,
        :ctype
    );
