# filecache
SQLite-cache of files

## Filecache

The default export. A class representing a cache of files

### Filecache.limit

Defaults to 256K. The limit above which we will not cache a file.

### new Filecache(dbfile) => filecache

Creates a new filecache

### .findFile(path) => Promise<stats>

Returns an object with the following keys:
- `path` the path of the file
- `size` the size or null-ish if it doesn't exist
- `mtime` the mtime or null-ish
- `missing` truthy if the file is missing
- `cached` truthy if the file is cached
- `chunks` how many chunks we have stored

### .readFile(path) => AsyncIterable

Returns the file as an async iterable.
If it doesn't exist, throws a `ENOENT`.

### .streamFile(path) => Readable

Returns the file as a readable stream

### .refresh => Promise

Checks the cached metadata against the real files, updating as required

### .prefetch(dir, filter) => Promise

Prefetches all the files in the dir and below.

If given, `filter` is `(name, path) => Boolean` to say if this file
should be pre-fetched.

### .clear(path)

Clears this path from the cache

### .reset()

Clears the whole cache

### .close()

Closes the database. Called automatically on exit
