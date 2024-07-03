import { suite, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, unlinkSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import SQLite from 'better-sqlite3'

import FileCache from '../src/index.mjs'

suite('filecache', { concurrency: false }, () => {
  const base = resolve('./test/assets')
  const dbFile = join(base, 'test.db')

  let cache
  before(() => {
    if (existsSync(dbFile)) unlinkSync(dbFile)
  })
  after(() => {
    if (cache) {
      cache.reset()
      cache.close()
    }
    cache = null
    if (existsSync(dbFile)) unlinkSync(dbFile)
  })

  test('create cache', () => {
    cache = new FileCache(dbFile)
    assert.ok(existsSync(dbFile))
  })

  test('fetch a file metadata', async () => {
    const file = join(base, 'file1')
    let act
    act = await cache.findFile(file)
    assert.ok(!file.missing)

    // do it again
    act = await cache.findFile(file)
    assert.ok(!act.missing)

    cache.reset()
  })

  test('cache a file', async () => {
    const file = join(base, 'file1')
    const exp = readFileSync(file)
    let act = await cache.readFile(file)
    assert.ok(Buffer.compare(act, exp) === 0)

    // get it again
    act = await cache.readFile(file)
    assert.ok(Buffer.compare(act, exp) === 0)

    // check via find
    act = await cache.findFile(file)
    assert.ok(act.cached)

    cache.clear(file)
  })

  test('multiple cache a file', async () => {
    const file = join(base, 'file1')
    const exp = readFileSync(file)
    const p1 = cache.readFile(file)
    const p2 = cache.readFile(file)

    await p1
    await p2

    assert.ok(Buffer.compare(await p1, exp) === 0)
    assert.ok(Buffer.compare(await p2, exp) === 0)

    cache.clear(file)
  })

  test('try to cache a file that doesnt exist', async () => {
    const file = join(base, 'blah')
    await assert.rejects(
      () => cache.readFile(file),
      err => {
        assert.ok(err.code === 'ENOENT')
        return true
      }
    )

    await assert.rejects(
      () => cache.readFile(file),
      err => {
        assert.ok(err.code === 'ENOENT')
        return true
      }
    )

    const act = await cache.findFile(file)
    assert.ok(act.missing)

    cache.clear(file)
  })

  test('try to cache a large file', async () => {
    const file = join(base, 'file2')
    let act
    act = await cache.readFile(file)
    assert.strictEqual(act, null)

    // do it again
    act = await cache.readFile(file)
    assert.strictEqual(act, null)

    cache.reset()
  })

  test('Make file with wrong version', () => {
    // clear old db
    cache.reset()
    cache.close()
    cache = null

    // write wrong version
    const db = new SQLite(dbFile)
    db.exec('UPDATE t_Schema SET version=9999;')
    db.close()

    // now try to create a new cache
    assert.throws(() => (cache = new FileCache(dbFile)))
  })
})
