--------------------------------------------------
-- reset the databse

DELETE FROM t_FileContent;
DELETE FROM t_File;
PRAGMA wal_checkpoint(TRUNCATE);
VACUUM;
