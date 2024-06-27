const { readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, basename } = require('node:path')

let data = ''
for (const name of readdirSync(__dirname)) {
  if (!name.endsWith('.sql') || name.endsWith('min.sql')) continue
  const sql = cleanSQL(readFileSync(join(__dirname, name), 'utf8'))
  const varname = name.replace('.sql', '')
  data += `export const ${varname}='${sql}'\n`
  writeFileSync(join(__dirname,name.replace('.sql','.min.sql')), sql)
}

writeFileSync(join(__dirname, '../src/sql.mjs'), data)

function cleanSQL(sql) {
  return sql
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('--'))
    .join(' ')
    .replace(/'/g,"\\'")
    .replace(/  +/g, ' ')
}
