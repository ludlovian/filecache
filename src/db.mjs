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

export function query (db, name, parms = '', opts = {}) {
  const { pluck, all, iterate } = opts
  parms = parms.split(':').filter(Boolean)
  let sql = `select * from ${name}`
  if (parms.length) {
    sql += ' where '
    sql += parms.map(x => `${x}=:${x}`).join(' and ')
  }
  let stmt = db.prepare(sql)
  if (pluck) stmt = stmt.pluck()
  /* c8 ignore start */
  if (all) {
    return parms => stmt.all(parms)
  } else if (iterate) {
    // when we iterate, we must create a statement for each one
    return parms => {
      let stmt = db.prepare(sql)
      if (pluck) stmt = stmt.pluck()
      return stmt.iterate(parms)
    }
  } else {
    return parms => stmt.get(parms)
  }
  /* c8 ignore end */
}

function getCols (db, name) {
  const sql = `select * from ${name}`
  return db
    .prepare(sql)
    .columns()
    .map(col => col.name)
}
