import { suite, test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { existsSync, unlinkSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import FileCache from '../src/index.mjs'

suite('filecache', { concurrency: false }, () => {
  const base = resolve('./test/assets')
  const dbFile = join(base, 'test.db')

  let cache
  before(() => {
    if (existsSync(dbFile)) unlinkSync(dbFile)
  })
  after(() => {
    if (cache) cache.reset()
    if (existsSync(dbFile)) unlinkSync(dbFile)
  })

  test('create cache', () => {
    cache = new FileCache(dbFile)
    assert.ok(existsSync(dbFile))
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
    assert.ok(act.status === FileCache.CACHED)

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
    assert.strictEqual(act, undefined)

    cache.clear(file)
  })

  test('read a file by iterator', async () => {
    const file = join(base, 'file1')
    const exp = readFileSync(file)
    let act = Buffer.alloc(0)
    for await (const chunk of cache.readFileIterator(file)) {
      act = Buffer.concat([act, chunk])
    }
    assert.ok(Buffer.compare(act, exp) === 0)

    // now do it again
    act = Buffer.alloc(0)
    for await (const chunk of cache.readFileIterator(file)) {
      act = Buffer.concat([act, chunk])
    }
    assert.ok(Buffer.compare(act, exp) === 0)
    cache.reset()
  })

  test('two parallel iterators', async () => {
    const file = join(base, 'file2')
    const it1 = cache.readFileIterator(file)
    const it2 = cache.readFileIterator(file)
    let res1
    let res2

    res1 = await it1.next()
    res2 = await it2.next()

    assert.ok(Buffer.compare(res1.value, res2.value) === 0)

    res2 = await it2.next()
    res1 = await it1.next()

    assert.ok(Buffer.compare(res1.value, res2.value) === 0)

    res1 = await it1.next()
    res2 = await it2.next()

    assert.ok(res1.done)
    assert.ok(res2.done)
  })

  test('read a file by readable stream', (t, done) => {
    const file = join(base, 'file1')
    const rs = cache.readFileStream(file)
    let data = Buffer.alloc(0)
    const exp = readFileSync(file)

    rs.on('data', chunk => (data = Buffer.concat([data, chunk])))
    rs.on('end', () => {
      assert.ok(Buffer.compare(data, exp) === 0)
      cache.clear(file)
      done()
    })
  })

  test('prefetch file', async () => {
    const file = join(base, 'file1')
    await cache.prefetch({ file })
    const exp = readFileSync(file)
    const act = await cache.readFile(file)
    assert.ok(Buffer.compare(act, exp) === 0)
    cache.clear(file)
  })

  test('prefetch dir', async () => {
    const file = join(base, 'file1')
    const filter = d => d.name === 'file1'
    await cache.prefetch({ dir: base, filter })
    await cache.prefetch({ dir: join(base, 'dir1') })
    await cache.prefetch({ dir: join(base, 'dir1') })
    const exp = readFileSync(file)
    const act = await cache.readFile(file)
    assert.ok(Buffer.compare(act, exp) === 0)
    cache.clear(file)
  })
})
