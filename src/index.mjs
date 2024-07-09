import { readFile, stat, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import Database from '@ludlovian/sqlite'
import createDDL from './ddl.mjs'
import runtimeDDL from './temp.ddl.mjs'

const SCHEMA_VERSION = 2
const EVERYTHING = () => true

export default class FileCache {
  static limit = 256 * 1024
  static commitDelay = 500

  #db

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

    const md = this.#db.get('vFile', { path })
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

    let md = this.#db.get('vFile', { path })
    if (!md) md = await this.#fetchFileMetadata(path)
    if (md.missing) throw MissingFile(path)
    if (md.size > FileCache.limit) return null
    if (md.cached) {
      return this.#db.get('vFileContent', { path }).data
    }
    const data = await readFile(path)
    this.#db.update('spAddFileContent', { path, data })
    return data
  }

  // clear
  //
  // Removes any cache entries for this path

  clear (path) {
    this.#db.update('spRemoveFile', { path })
  }

  // reset
  //
  // resets the database

  reset () {
    this.#db.update('spReset')
  }

  // prefetch
  //
  async prefetch (root, filter, options) {
    filter ??= EVERYTHING
    const every = options?.every ?? 500
    root = resolve(root)
    const files = await readdir(root, {
      recursive: true,
      withFileTypes: true
    })
    await this.#db.transaction({ every }, async () => {
      for (const dirent of files) {
        if (dirent.isFile()) {
          const path = join(dirent.parentPath, dirent.name)
          if (filter(dirent.name, path)) {
            await this.readFile(path)
          }
        }
      }
    })
  }

  // ------------------------------------------------
  // Internal functions

  async #fetchFileMetadata (path) {
    try {
      const { size, mtimeMs: mtime } = await stat(path)
      this.#db.update('spUpdateFile', { path, mtime, size })
      return { path, mtime, size, missing: 0, cached: 0 }
    } catch (err) {
      // defensive
      /* c8 ignore next */
      if (err.code !== 'ENOENT') throw err
      this.#db.update('spUpdateFile', { path, mtime: null, size: null })
      return { path, missing: 1, cached: 0 }
    }
  }
}

function MissingFile (path) {
  const err = new Error(`ENOENT: File missing: ${path}`)
  err.code = 'ENOENT'
  err.path = path
  return err
}
