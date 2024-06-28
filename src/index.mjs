import { open, stat, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Readable } from 'node:stream'
import SQLite from 'better-sqlite3'
import { ddl, storedProc, query } from './db.mjs'

const BUFFERSIZE = 64 * 1024
const NOOP = () => undefined

export default class FileCache {
  static NOTEXIST = 0
  static METADATA = 1
  static UPDATING = 2
  static CACHED = 3

  #db
  #findFile
  #readFile
  #addFilePart
  #updateFile
  #removeFile
  #reset

  constructor (dbFile) {
    this.#db = SQLite(dbFile)
    this.#prepareDB()
  }

  #prepareDB () {
    const db = this.#db
    db.exec(ddl)
    this.#findFile = query(db, 'vw_File', 'path')
    this.#readFile = query(db, 'vw_FileContent', 'path', {
      pluck: true,
      iterate: true
    })
    this.#addFilePart = storedProc(db, 'sp_addFilePart')
    this.#updateFile = storedProc(db, 'sp_updateFile')
    this.#removeFile = storedProc(db, 'sp_removeFile')
    this.#reset = storedProc(db, 'sp_reset', true)
  }

  // Finds a file and returns the metadata for it, or undefined
  // if the file does not exist.
  //
  // Caches the metadata if not already stored.
  async findFile (path) {
    path = resolve(path)

    const details = this.#findFile({ path })
    if (details) {
      return details.status === FileCache.NOTEXIST ? undefined : details
    }

    try {
      const stats = await stat(path)
      const details = {
        status: FileCache.METADATA,
        mtime: +stats.mtime,
        size: stats.size
      }

      this.#updateFile({ path, ...details })
      return details
    } catch (err) {
      // defensive check
      /* c8 ignore start */
      if (err.code !== 'ENOENT') throw err
      /* c8 ignore end */

      this.#updateFile({
        path,
        status: FileCache.NOTEXIST,
        mtime: null,
        size: null
      })
      return undefined
    }
  }

  async * #readFileParts (path) {
    path = resolve(path)
    let details = this.#findFile({ path })
    if (!details) {
      details = await this.findFile(path)
    }

    if (!details || details.status === FileCache.NOTEXIST) {
      // we already know it doesn't exist, so throw an ENOENT
      const err = new Error('ENOENT')
      err.code = 'ENOENT'
      throw err
    }

    if (details.status === FileCache.CACHED) {
      for (const data of this.#readFile({ path })) {
        yield data
      }
      return
    }

    // we need to read it from the file system.
    // If nobody else is, we should also cache it
    const shouldCache = details.status === FileCache.METADATA
    if (shouldCache) {
      details.status = FileCache.UPDATING
      this.#updateFile({ path, ...details })
    }

    // Allocate a buffer and start reading chunks into it
    const buff = Buffer.alloc(BUFFERSIZE)
    const fh = await open(path, 'r')

    try {
      while (true) {
        const { bytesRead } = await fh.read(buff)
        const data = buff.slice(0, bytesRead)
        if (shouldCache) {
          this.#addFilePart({ path, data })
        }
        yield data
        if (bytesRead < buff.byteLength) {
          break
        }
      }

      if (shouldCache) {
        details.status = FileCache.CACHED
        this.#updateFile({ path, ...details })
      }
    } finally {
      fh.close()
    }
  }

  async readFile (path) {
    let buffer = Buffer.alloc(0)
    for await (const chunk of this.#readFileParts(path)) {
      buffer = Buffer.concat([buffer, chunk])
    }
    return buffer
  }

  readFileStream (path) {
    return Readable.from(this.#readFileParts(path))
  }

  clear (path) {
    this.#removeFile({ path })
  }

  reset () {
    this.#reset()
  }

  async prefetch ({ file, dir, filter }) {
    if (dir) {
      dir = resolve(dir)
      const opts = { withFileTypes: true, recursive: true }
      for (const dirent of await readdir(dir, opts)) {
        if (!dirent.isFile()) continue
        if (filter && !filter(dirent)) continue
        const file = join(dirent.parentPath, dirent.name)
        await this.prefetch({ file })
      }
      this.#db.pragma('wal_checkpoint(TRUNCATE);')
    } else if (file) {
      const stats = await stat(file)
      const details = this.#findFile({ path: file })
      // skip this fetch if we have a valid record that matches
      if (
        details &&
        details.status === FileCache.CACHED &&
        details.mtime === +stats.mtime &&
        details.size === stats.size
      ) {
        return
      }
      this.#removeFile({ path: file })
      for await (const chunk of this.#readFileParts(file)) {
        NOOP(chunk)
      }
    }
  }
}
