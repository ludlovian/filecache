export const ddl =
  'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; BEGIN TRANSACTION; CREATE TABLE IF NOT EXISTS t_File ( id INTEGER PRIMARY KEY NOT NULL, path TEXT NOT NULL UNIQUE, mtime INT, size INT ); CREATE TABLE IF NOT EXISTS t_FileContent ( id INTEGER PRIMARY KEY NOT NULL, data BLOB NOT NULL, FOREIGN KEY (id) REFERENCES t_File(id) ON DELETE CASCADE ); DROP VIEW IF EXISTS vw_File; CREATE VIEW vw_File(path, mtime, size, missing, cached) AS SELECT f.path, f.mtime, f.size, f.size IS NULL, COUNT(c.id) > 0 FROM t_File f LEFT JOIN t_FileContent c ON c.id = f.id GROUP BY f.path; DROP VIEW IF EXISTS vw_FileContent; CREATE VIEW vw_FileContent (data, path) AS SELECT c.data, f.path FROM t_File f JOIN t_FileContent c ON f.id = c.id; DROP VIEW IF EXISTS sp_removeFile; CREATE VIEW sp_removeFile(path) AS SELECT 0 WHERE 0; CREATE TRIGGER sp_removeFile_t INSTEAD OF INSERT ON sp_removeFile BEGIN DELETE FROM t_File WHERE path = NEW.path; END; DROP VIEW IF EXISTS sp_addFileContent; CREATE VIEW sp_addFileContent(path, data) AS SELECT 0, 0 WHERE 0; CREATE TRIGGER sp_addFileContent_t INSTEAD OF INSERT ON sp_addFileContent BEGIN INSERT OR IGNORE INTO t_File (path) VALUES (NEW.path); INSERT INTO t_FileContent (id, data) SELECT f.id, NEW.data FROM t_file f WHERE f.path = NEW.path ON CONFLICT (id) DO UPDATE SET data = NEW.data; END; DROP VIEW IF EXISTS sp_updateFile; CREATE VIEW sp_updateFile(path, mtime, size) AS SELECT 0, 0, 0 WHERE 0; CREATE TRIGGER sp_updateFile_t INSTEAD OF INSERT ON sp_updateFile BEGIN INSERT INTO t_File (path, mtime, size) VALUES (NEW.path, NEW.mtime, NEW.size) ON CONFLICT (path) DO UPDATE SET (mtime, size) = (NEW.mtime, NEW.size); END; DROP VIEW IF EXISTS sp_reset; CREATE VIEW sp_reset(unused) AS SELECT 0 WHERE 0; CREATE TRIGGER sp_reset_t INSTEAD OF INSERT ON sp_reset BEGIN DELETE FROM t_File; END; COMMIT; PRAGMA wal_checkpoint(truncate); VACUUM;'
