import { open, stat, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Readable } from 'node:stream'
import SQLite from 'better-sqlite3'
import {
  ddl,
  findFile,
  readFile,
  addFilePart,
  updateFile,
  removeFile,
  reset
} from './sql.mjs'

const UPDATING = 'updating'
const BUFFERSIZE = 64 * 1024
const NOOP = () => undefined

export default class FileCache {
  #db
  #findFile
  #readFile
  #addFilePart
  #updateFile
  #removeFile
  constructor (dbFile) {
    this.#db = SQLite(dbFile)
    this.#db.exec(ddl)
    this.#findFile = this.#db.prepare(findFile).pluck()
    this.#readFile = this.#db.prepare(readFile).pluck()
    this.#addFilePart = this.#db.prepare(addFilePart)
    this.#updateFile = this.#db.prepare(updateFile)
    this.#removeFile = this.#db.prepare(removeFile)
  }

  async * #readFileParts (path) {
    path = resolve(path)
    const etag = this.#findFile.get({ path })
    if (etag === null) {
      // we already know it doesn't exist, so throw an ENOENT
      const err = new Error('ENOENT')
      err.code = 'ENOENT'
      throw err
    }

    if (etag !== undefined && etag !== UPDATING) {
      // we have it so serve from the cache
      for (const data of this.#readFile.iterate({ path })) {
        yield data
      }
      return
    }

    const shouldCache = etag !== UPDATING
    // we don't have it so we must read it from the file system
    let newEtag
    if (shouldCache) {
      try {
        const stats = await stat(path)
        newEtag = `W/"${stats.size}-${+stats.mtime}"`
      } catch (err) {
        if (err.code === 'ENOENT') {
          this.#updateFile.run({ path, etag: null })
        }
        throw err
      }
    }

    // Allocate a buffer and start reading chunks into it
    const buff = Buffer.alloc(BUFFERSIZE)
    const fh = await open(path, 'r')

    try {
      while (true) {
        const { bytesRead } = await fh.read(buff)
        const data = buff.slice(0, bytesRead)
        if (shouldCache) {
          this.#addFilePart.run({ path, data })
        }
        yield data
        if (bytesRead < buff.byteLength) {
          break
        }
      }

      if (shouldCache) {
        this.#updateFile.run({ path, etag: newEtag })
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
    this.#removeFile.run({ path })
  }

  reset () {
    this.#db.exec(reset)
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
      const etag = `W/"${stats.size}-${+stats.mtime}"`
      const dbEtag = this.#findFile.get({ path: file })
      if (etag === dbEtag) return
      this.#removeFile.run({ path: file })
      for await (const chunk of this.#readFileParts(file)) {
        NOOP(chunk)
      }
    }
  }
}
