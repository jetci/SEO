import mysql from 'mysql2/promise';
const pool = mysql.createPool({ host:'127.0.0.1', port:3306, user:'eeat', password:'eeat_secret', database:'eeat_studio_v2', waitForConnections:true, connectionLimit:5 });

async function main() {
  try { await pool.query('DESCRIBE users').then(r=>{ console.log('\n=== USERS COLUMNS ==='); r[0].forEach(c=>console.log(`${c.Field} (${c.Type})`)); }); } catch(e) { console.log('USERS DESC FAIL',e.message); }
  try { await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 10').then(r=>{ console.log('\n=== USERS LAST 10 ==='); r[0].forEach(u=>console.log(JSON.stringify(u))); }); } catch(e) { console.log('USERS FAIL',e.message); }
  try { await pool.query('SELECT * FROM projects ORDER BY id DESC LIMIT 15').then(r=>{ console.log('\n=== PROJECTS LAST 15 ==='); r[0].forEach(p=>console.log(JSON.stringify(p))); }); } catch(e) { console.log('PROJS FAIL',e.message); }
  try { await pool.query('SELECT * FROM team_members LIMIT 10').then(r=>{ console.log('\n=== TEAM MEMBERS (first 10) ==='); r[0].forEach(t=>console.log(JSON.stringify(t))); }); } catch(e) { console.log('TM FAIL',e.message); }
  pool.end();
} main().catch(e=>{ console.error('FATAL',e); process.exit(1); });
