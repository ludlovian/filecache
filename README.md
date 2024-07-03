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

Caches the file if it exists, can, and hasn't already been.

### .readFile(path) => Promise<Buffer|null>

Reads the file and returns it. If it is too large to cache, returns `null`
If it doesn't exist, throws a `ENOENT`.

### .clear(path)

Clears this path from the cache

### .reset()

Clears the whole cache

### .close()

Closes the database. Called automatically on exit
