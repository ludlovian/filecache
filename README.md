# filecache
SQLite-cache of files

## Filecache

The default export. A class representing a cache of files

### new Filecache (dbfile) => filecache

Creates a new filecache

### .readFile(path) => Promise<Buffer>

Reads the file, ideally from the cache if we have it. If not, the file is cached for future reads.

The contents are returned as a Buffer

### .readFileStream(path) => Stream

Returns a readable stream of the file, ideally from the cache.

### .preFetch(opts) => Promise

Pre-fetches files if not already cached (and size/mtime unchanged). The options are:
- `file` - prefetch this file
- `dir` - Scan all files under this dir and prefetch these (takes precedence over `file`)
- `filter` - if given, the function can examine the `fs.Dirent` to see if it should be pre-fetched

