import process from 'node:process'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import SQLite from 'better-sqlite3'
import Bouncer from '@ludlovian/bouncer'
import { ddl } from './ddl.mjs'

export default class FileCache {
  static limit = 256 * 1024
  static commitDelay = 500

  #db
  #inTransaction
  #bouncerCommit

  #query = {}
  #storedProc = {}

  constructor (dbFile) {
    this.#db = SQLite(dbFile)
    this.#prepareDB()
    process.on('exit', () => this.#close())
  }

  // ------------------------------------------------
  // Set up

  #prepareDB () {
    const db = this.#db
    // Set up the database and check the schema
    db.exec(ddl)
    const isValid = db
      .prepare('select valid from _vSchema')
      .pluck()
      .get()
    if (!isValid) {
      this.#close()
      throw new Error('Database schema invalid: ' + this.#db.name)
    }

    // queries
    this.#query = {
      getFileMetadata: db.prepare('select * from vFile where path=?'),
      getFile: db.prepare('select data from FileContent where path=?').pluck()
    }

    // stored procs
    this.#storedProc = {
      begin: db.prepare('begin transaction'),
      commit: db.prepare('commit'),
      updateFile: db.prepare('insert into spUpdateFile values(?,?,?)'),
      removeFile: db.prepare('insert into spRemoveFile values(?)'),
      addFileContent: db.prepare('insert into spAddFileContent values(?,?)'),
      reset: db.prepare('insert into spReset values(null)')
    }

    this.#bouncerCommit = new Bouncer({
      after: FileCache.commitDelay,
      fn: () => this.#commit()
    })
  }

  #close () {
    if (this.#db?.open) this.#db.close()
    this.#bouncerCommit.cancel()
    this.#db = undefined
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

  close () {
    this.#close()
  }

  // ------------------------------------------------
  // Internal functions

  async #fetchFileMetadata (path) {
    try {
      const { size, mtimeMs: mtime } = await stat(path)
      this.#updateFile({ path, size, mtime })
      return { path, size, mtime, missing: 0, cached: 0 }
    } catch (err) {
      // defensive
      /* c8 ignore next */
      if (err.code !== 'ENOENT') throw err
      this.#updateFile({ path, size: null, mtime: null })
      return { path, missing: 1 }
    }
  }

  // ------------------------------------------------
  // DB access
  //

  #getFileMetadata (path) {
    return this.#query.getFileMetadata.get(path)
  }

  #getFile (path) {
    return this.#query.getFile.get(path)
  }

  #begin () {
    if (!this.#inTransaction) {
      this.#storedProc.begin.run()
      this.#inTransaction = true
    }
    this.#bouncerCommit.fire()
  }

  #commit () {
    if (!this.#inTransaction) return
    this.#storedProc.commit.run()
    this.#inTransaction = false
  }

  #addFileContent ({ path, data }) {
    this.#begin()
    this.#storedProc.addFileContent.run(path, data)
  }

  #updateFile ({ path, size, mtime }) {
    this.#begin()
    this.#storedProc.updateFile.run(path, mtime, size)
  }

  #removeFile ({ path }) {
    this.#begin()
    this.#storedProc.removeFile.run(path)
  }

  #reset () {
    this.#begin()
    this.#storedProc.reset.run()
  }
}

function MissingFile (path) {
  const err = new Error(`ENOENT: File missing: ${path}`)
  err.code = 'ENOENT'
  err.path = path
  return err
}
