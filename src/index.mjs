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
  #readFileParts
  #addFilePart
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
    this.#findFile = query(db, 'vw_File', 'path')
    this.#readFile = query(db, 'vw_FileContent', 'path', {
      pluck: true,
      all: true
    })
    this.#readFileParts = query(db, 'vw_FileContent', 'path', {
      pluck: true,
      iterate: true
    })
    this.#addFilePart = storedProc(db, 'sp_addFilePart')
    this.#updateFile = storedProc(db, 'sp_updateFile')
    this.#removeFile = storedProc(db, 'sp_removeFile')
    this.#reset = storedProc(db, 'sp_reset', true)
  }

  // ------------------------------------------------
  // Internal cache functions

  #getCachedMetadata (path) {
    return this.#findFile({ path })
  }

  #writeCacheMetadata ({ path, status, mtime = null, size = null }) {
    this.#updateFile({ path, status, mtime, size })
  }

  #getCachedFile (path) {
    return Buffer.concat(this.#readFile({ path }))
  }

  * #getCachedFileIterator (path) {
    for (const chunk of this.#readFileParts({ path })) {
      yield chunk
    }
  }

  // ------------------------------------------------
  // Internal helpers
  //
  //
  async #getFileMetadata (path) {
    try {
      const { size, mtimeMs: mtime } = await stat(path)
      const status = FileCache.METADATA
      const md = { path, size, mtime, status }
      this.#writeCacheMetadata(md)
      return md
    } catch (err) {
      // defensive check
      /* c8 ignore start */
      if (err.code !== 'ENOENT') throw err
      /* c8 ignore end */
      const status = FileCache.NOTEXIST
      const md = { path, status }
      this.#writeCacheMetadata(md)
      return md
    }
  }

  async * #readAndCacheFileIterator (path, md) {
    if (!md) md = await this.#getFileMetadata(path)
    if (md.status === FileCache.NOTEXIST) {
      const err = new Error('ENOENT')
      err.code = 'ENOENT'
      err.path = path
      throw err
    }

    const shouldCache = md.status === FileCache.METADATA
    if (shouldCache) {
      md.status = FileCache.UPDATING
      this.#writeCacheMetadata(md)
    }

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
        md.status = FileCache.CACHED
        this.#writeCacheMetadata(md)
      }
    } finally {
      fh.close()
    }
  }

  // ------------------------------------------------
  // External API
  //
  // async findFile (path) => metadata / undefined
  //
  // Finds a file and returns the metadata for it, or undefined
  // if the file does not exist.
  //
  // Caches the metadata if not already stored.
  async findFile (path) {
    path = resolve(path)

    let md = this.#getCachedMetadata(path)
    if (!md) md = await this.#getFileMetadata(path)
    return md.status === FileCache.NOTEXIST ? undefined : md
  }

  // async readFile (path) => Buffer
  //
  // Returns a promise of the buffer of this file
  //
  async readFile (path) {
    path = resolve(path)
    const md = this.#getCachedMetadata(path)
    if (md?.status === FileCache.CACHED) {
      return this.#getCachedFile(path)
    }

    let buff = Buffer.alloc(0)
    for await (const part of this.#readAndCacheFileIterator(path, md)) {
      buff = Buffer.concat([buff, part])
    }
    return buff
  }

  // async * readFileIterator (path) => AsyncIterator
  //
  // Returns an async iterator over a file
  //
  async * readFileIterator (path) {
    path = resolve(path)
    const md = this.#getCachedMetadata(path)
    if (md?.status === FileCache.CACHED) {
      yield * this.#getCachedFileIterator(path)
      return
    }

    yield * this.#readAndCacheFileIterator(path, md)
  }

  // readFileStream => Readable
  //
  // returns a readable stream
  readFileStream (path) {
    return Readable.from(this.readFileIterator(path))
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
      const md = this.#getCachedMetadata(file)

      // skip this fetch if we have a valid record that matches
      if (
        md &&
        md.status === FileCache.CACHED &&
        md.mtime === +stats.mtime &&
        md.size === stats.size
      ) {
        return
      }
      this.#removeFile({ path: file })
      for await (const part of this.#readAndCacheFileIterator(file)) {
        NOOP(part)
      }
    }
  }
}
