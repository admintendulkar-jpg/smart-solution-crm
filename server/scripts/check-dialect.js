const { transformDialect, convertPlaceholders } = require('../dist/db/dialect.js');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'db', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const issues = [];

for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  const t = transformDialect(sql, true);
  if (t !== sql) {
    console.log('== ' + f + ' (dialect changed) ==');
    const oldLines = sql.split('\n');
    t.split('\n').forEach((l, i) => {
      if (l !== oldLines[i]) console.log('  ' + (i + 1) + ': ' + l.trim());
    });
  } else {
    console.log('== ' + f + ' (unchanged) ==');
  }
  if (/AUTOINCREMENT|julianday|datetime\(\s*'now'|DROP TABLE clients;/.test(t)) {
    issues.push(f + ' still has sqlite-isms');
  }
}

console.log(issues.length ? 'ISSUES: ' + issues.join(', ') : 'No obvious sqlite-isms after transform');

const probe = "SELECT * FROM leave_requests WHERE status IN ('Pending','Approved') AND NOT (to_date < ? OR from_date > ?) AND note = '?'";
console.log('placeholder probe:', convertPlaceholders(probe, true));