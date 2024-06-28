const { readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, basename } = require('node:path')

const ddlFile = join(__dirname, 'ddl.sql')
const outJSFile = join(__dirname, '../src/ddl.mjs')
const outSQLFile = join(__dirname, 'ddl.min.sql')

const sql = cleanSQL(readFileSync(ddlFile, 'utf8'))
const jsFile = `export const ddl =\n  '${sql}'\n`

writeFileSync(outJSFile, jsFile)
writeFileSync(outSQLFile, sql)

function cleanSQL(sql) {
  return sql
    // break into line
    .split('\n')
    // anything after "--" is a comment to be removed
    .map(line => line.replace(/--.*$/,''))
    // remove whitespace
    .map(line => line.trim())
    // and now blank lines
    .filter(Boolean)
    // put it all back together
    .join(' ')
    // quote any quotes
    .replace(/'/g,"\\'")
    // remove multiple spaces
    .replace(/  +/g, ' ')
}
