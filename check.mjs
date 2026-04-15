import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

const SQL = await initSqlJs.default();
const db = new SQL.Database(readFileSync('.squish/squish.db'));
console.log('Places cols:', db.exec("PRAGMA table_info(places)")[0].values.map(r => r[1]).join(', '));
console.log('Memories cols:', db.exec("PRAGMA table_info(memories)")[0].values.map(r => r[1]).filter(c => c.includes('place') || c.includes('loci')).join(', '));