export { ddl } from './ddl.mjs'

export function storedProc (db, name, noparms = false) {
  if (noparms) {
    const sql = `insert into ${name} values(null);`
    const stmt = db.prepare(sql)
    return () => stmt.run()
  } else {
    const cols = getCols(db, name)
    const sql = [
      `insert into ${name}(`,
      cols.join(','),
      ') values(',
      cols.map(c => ':' + c).join(','),
      ')'
    ].join('')
    const stmt = db.prepare(sql)
    return parms => stmt.run(parms)
  }
}

function getCols (db, name) {
  const sql = `select * from ${name}`
  return db
    .prepare(sql)
    .columns()
    .map(col => col.name)
}
