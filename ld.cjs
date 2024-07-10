import('./src/index.mjs')
  .then(mod => {
    global.FileCache = mod.default
    console.log('FileCache loaded')
  })
