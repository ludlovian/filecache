import { open, stat, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Readable } from 'node:stream'
import Database from '@ludlovian/sqlite'
import Lock from '@ludlovian/lock'
import createDDL from './ddl.mjs'
import runtimeDDL from './temp.ddl.mjs'

const SCHEMA_VERSION = 3
const EVERYTHING = () => true

export default class FileCache {
  static chunkSize = 64 * 1024
  static commitDelay = 500

  #db
  #lock = new Lock()

  constructor (dbFile) {
    const opts = { createDDL, runtimeDDL, checkSchema: SCHEMA_VERSION }
    this.#db = new Database(dbFile, opts)
  }

  close () {
    this.#db.close()
  }

  // ------------------------------------------------
  // External API
  //
  // async findFile (path) => metadata
  //
  // Caches the metadata if not already stored.

  async findFile (path) {
    path = resolve(path)

    const md = this.#db.get('viewFile', { path })
    return md ?? (await this.#fetchFileMetadata(path))
  }

  // ------------------------------------------------
  // readFile (path)
  //
  // async generator to give you the file's contents
  //
  // throws if the file doesn't exist

  async * readFile (path) {
    path = resolve(path)

    let md = await this.findFile(path)
    if (md.missing) throw MissingFile(path)
    if (!md.cached) md = await this.#storeFileContent(path)
    const { mtime, size, chunks } = md
    for (let seq = 1; seq <= chunks; seq++) {
      const parms = { path, seq, mtime, size }
      const chunk = this.#db.get('viewFileChunk', parms)
      yield chunk.data
    }
  }

  // ------------------------------------------------
  // streamFile (path)
  //
  // A readable file stream of the files contents
  //

  streamFile (path) {
    return Readable.from(this.readFile(path), {
      objectMode: false
    })
  }

  // clear
  //
  // Removes any cache entries for this path

  clear (path) {
    this.#db.update('removeFile', { path })
  }

  // reset
  //
  // resets the database

  reset () {
    this.#db.update('resetCache')
  }

  // refresh
  async refresh () {
    const ms = FileCache.commitDelay
    await this.#db.asyncTransaction(ms, async () => {
      const rows = this.#db.all('viewRealFiles')
      for (const { path } of rows) {
        const stats = await this.#stat(path)
        // the act of storing deletes content if changed
        // and is a NOOP is nothing has changed
        this.#storeMetadata(path, stats)
      }
    })
  }

  // prefetch
  //
  async prefetch (root, filter = EVERYTHING) {
    const ms = FileCache.commitDelay
    root = resolve(root)
    const files = await readdir(root, {
      recursive: true,
      withFileTypes: true
    })
    await this.#db.asyncTransaction(ms, async () => {
      for (const dirent of files) {
        if (dirent.isFile()) {
          const path = join(dirent.parentPath, dirent.name)
          if (filter(dirent.name, path)) {
            this.#storeMetadata(path, await this.#stat(path))
            await this.#storeFileContent(path)
          }
        }
      }
    })
  }

  // ------------------------------------------------
  // Internal functions

  async #fetchFileMetadata (path) {
    const stats = await this.#stat(path)
    return this.#storeMetadata(path, stats)
  }

  async #stat (path) {
    try {
      return await stat(path)
    } catch (err) {
      // defensive
      /* c8 ignore next */
      if (err.code !== 'ENOENT') throw err
      return null
    }
  }

  #storeMetadata (path, stats) {
    const mtime = stats ? Math.trunc(stats.mtimeMs) : null
    const size = stats ? stats.size : null
    this.#db.update('updateFile', { path, mtime, size })
    return this.#db.get('viewFile', { path })
  }

  #storeFileContent (path) {
    // caching files is serialised, and with
    // async transactions
    return this.#lock.exec(async () => {
      const ms = FileCache.commitDelay
      await this.#db.asyncTransaction(ms, async () => {
        const len = FileCache.chunkSize
        const buff = Buffer.alloc(len)
        let fh
        try {
          this.#db.update('removeFileChunks', { path })
          fh = await open(path, 'r')
          let bytesRead = len
          for (let seq = 1; bytesRead === len; seq++) {
            bytesRead = (await fh.read(buff, 0, len)).bytesRead
            if (bytesRead) {
              this.#db.update('addFileChunk', {
                path,
                seq,
                data: bytesRead < len ? buff.slice(0, bytesRead) : buff
              })
            }
          }
        } finally {
          await fh?.close()
        }
      })
      return this.#db.get('viewFile', { path })
    })
  }
}

function MissingFile (path) {
  const err = new Error(`ENOENT: File missing: ${path}`)
  err.code = 'ENOENT'
  err.path = path
  return err
}
