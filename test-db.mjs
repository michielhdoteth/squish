import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

const SQL = await initSqlJs.default();
const db = new SQL.Database(readFileSync('.squish/squish.db'));
const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log('Tables:', result[0]?.values.map(r => r[0]).join(', ') || 'No tables');
console.log('Has learnings?', result[0]?.values.flat().includes('learnings'));
console.log('Has observations?', result[0]?.values.flat().includes('observations'));