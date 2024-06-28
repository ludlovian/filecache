import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import SQLite from 'better-sqlite3'
import { ddl, storedProc } from './db.mjs'

export default class FileCache {
  static limit = 256 * 1024

  #db

  #getFileMetadata
  #getFile

  #addFileContent
  #updateFile
  #removeFile
  #reset

  constructor (dbFile) {
    this.#db = SQLite(dbFile)
    this.#prepareDB()
  }

  // ------------------------------------------------
  // Set up

  #prepareDB () {
    const db = this.#db
    db.exec(ddl)
    // queries
    const stmtGetFileMetadata = db.prepare('select * from vw_File where path=?')
    this.#getFileMetadata = path => stmtGetFileMetadata.get(path)

    const stmtGetFile = db.prepare('select * from vw_FileContent where path=?')
    this.#getFile = path => stmtGetFile.pluck().get(path)

    // stored procs
    this.#updateFile = storedProc(db, 'sp_updateFile')
    this.#removeFile = storedProc(db, 'sp_removeFile')
    this.#addFileContent = storedProc(db, 'sp_addFileContent')
    this.#reset = storedProc(db, 'sp_reset', true)
  }

  // ------------------------------------------------
  // External API
  //
  // async findFile (path) => metadata
  //
  // Caches the metadata if not already stored.

  async findFile (path) {
    path = resolve(path)

    const md = this.#getFileMetadata(path)
    return md ?? (await this.#fetchFileMetadata(path))
  }

  // async readFile (path) => Buffer | null
  //
  // If the file doesn't exist, we throw (you should have checked)
  // If the file is too large, we return null
  // If we have the file, or it is small enough, we
  // return it, caching if required

  async readFile (path) {
    path = resolve(path)

    let md = this.#getFileMetadata(path)
    if (!md) md = await this.#fetchFileMetadata(path)
    if (md.missing) throw MissingFile(path)

    if (md.size > FileCache.limit) return null
    if (md.cached) return this.#getFile(path)
    const data = await readFile(path)
    this.#addFileContent({ path, data })
    return data
  }

  // clear
  //
  // Removes any cache entries for this path

  clear (path) {
    this.#removeFile({ path })
  }

  // reset
  //
  // resets the database

  reset () {
    this.#reset()
  }

  // ------------------------------------------------
  // Internal functions

  async #fetchFileMetadata (path) {
    try {
      const { size, mtimeMs: mtime } = await stat(path)
      this.#updateFile({ path, size, mtime })
      return { path, size, mtime }
    } catch (err) {
      // defensive
      /* c8 ignore next */
      if (err.code !== 'ENOENT') throw err
      this.#updateFile({ path, size: null, mtime: null })
      return { path, missing: true }
    }
  }
}

function MissingFile (path) {
  const err = new Error(`ENOENT: File missing: ${path}`)
  err.code = 'ENOENT'
  err.path = path
  return err
}
