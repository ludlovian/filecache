import { suite, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { join, resolve } from 'node:path'

import FileCache from '../src/index.mjs'

suite('filecache', { concurrency: false }, () => {
  const base = resolve('./test/assets')
  const dbFile = join(base, 'test.db')

  let cache
  before(() => {
    execSync(`rm -f ${dbFile}`)
  })
  after(() => {
    if (cache) cache.reset()
    if (cache) cache.close()
    cache = null
    execSync(`rm -f ${dbFile}`)
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
    let act = await readAsync(cache.readFile(file))
    assert.ok(Buffer.compare(act, exp) === 0)

    // get it again
    act = await readAsync(cache.readFile(file))
    assert.ok(Buffer.compare(act, exp) === 0)

    // check via find
    act = await cache.findFile(file)
    assert.ok(act.cached)

    cache.clear(file)
  })

  test('large file', async () => {
    const file = join(base, 'file2')
    const exp = readFileSync(file)
    let act = await readAsync(cache.readFile(file))
    assert.ok(Buffer.compare(act, exp) === 0)

    // check via find
    act = await cache.findFile(file)
    assert.ok(act.cached)
    assert.ok(act.chunks > 1)

    cache.clear(file)
  })

  test('read a cached file via stream', async () => {
    const file = join(base, 'file1')
    const exp = readFileSync(file)

    let sink = fileSink()
    let f = cache.streamFile(file)
    f.pipe(sink)
    await finished(sink)
    let act = sink.contents
    assert.ok(Buffer.compare(act, exp) === 0)

    // do it again, to read from cached

    sink = fileSink()
    f = cache.streamFile(file)
    f.pipe(sink)
    await finished(sink)
    act = sink.contents
    assert.ok(Buffer.compare(act, exp) === 0)

    cache.clear(file)
  })

  test('try to cache a file that doesnt exist', async () => {
    const file = join(base, 'blah')
    await assert.rejects(
      () => readAsync(cache.readFile(file)),
      err => {
        assert.ok(err.code === 'ENOENT')
        return true
      }
    )

    await assert.rejects(
      () => readAsync(cache.readFile(file)),
      err => {
        assert.ok(err.code === 'ENOENT')
        return true
      }
    )

    const act = await cache.findFile(file)
    assert.ok(act.missing)

    cache.clear(file)
  })

  test('prefetch and refresh a directory', async () => {
    await cache.prefetch('test')
    await cache.refresh()
  })
})

async function readAsync (src) {
  let buff = Buffer.from('')
  for await (const chunk of src) {
    buff = Buffer.concat([buff, chunk])
  }
  return buff
}

function fileSink () {
  let buff = Buffer.from('')
  const str = new Writable({
    write (chunk, _, callback) {
      buff = Buffer.concat([buff, chunk])
      callback()
    },
    final (callback) {
      str.contents = buff
      callback()
    }
  })
  return str
}
