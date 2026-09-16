import mysql from 'mysql2/promise';
const pool = mysql.createPool({ host:'127.0.0.1', port:3306, user:'eeat', password:'eeat_secret', database:'eeat_studio_v2', waitForConnections:true, connectionLimit:5 });

async function main() {
  const [users] = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 5');
  console.log('\n=== LAST 5 USERS ===');
  users.forEach(u => console.log(JSON.stringify(u)));

  // get the latest admin user
  const latestUser = users[0];
  console.log('\nLatest user (newest): id=', latestUser?.id, 'email=', latestUser?.email, 'role=', latestUser?.role);

  // ensure this user is a member of team 1 (owner or admin permission)
  try {
    if (latestUser?.id) {
      // check if already a member of team 1
      const [exists] = await pool.query('SELECT * FROM team_members WHERE team_id = 1 AND user_id = ? LIMIT 1', [latestUser.id]);
      if (!exists.length) {
        const [res] = await pool.query('INSERT INTO team_members (team_id, user_id, permission, joined_at) VALUES (1, ?, "admin", NOW())', [latestUser.id]);
        console.log('\n✅ INSERT team_members team=1 user=' + latestUser.id + ' admin permission OK. insertId=', res.insertId);
      } else {
        console.log('\nℹ️  User id=' + latestUser.id + ' is ALREADY a member of team 1. record:', JSON.stringify(exists[0]));
      }
    }

    // Bonus: also ensure ALL existing projects are team=1 ownership correct (already set owner=1 team=1)
    const [p] = await pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN team_id=1 THEN 1 END) as team1, COUNT(CASE WHEN owner_id=1 THEN 1 END) as owner1 FROM projects');
    console.log('\nProjects audit: total=' + p[0].total + ' | team_id=1: ' + p[0].team1 + ' | owner_id=1: ' + p[0].owner1);
  } catch (e) {
    console.error('FAIL', e.message);
  }
  pool.end();
} main().catch(e=>{ console.error('FATAL',e); process.exit(1); });
