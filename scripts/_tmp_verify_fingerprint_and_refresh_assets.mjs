import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 20000 };
async function x(ssh, c) { return String(await ssh.exec(c) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG); await ssh.connect();
  const REMOTE_DIR = '/home/ubuntu/eeat-studio-v2/dist/assets';
  const files = (await x(ssh, `ls -1 ${REMOTE_DIR}/WritePage.*.js 2>/dev/null`)).split(/\n+/).filter(Boolean);
  console.log('REMOTE WritePage bundles:', files.length);
  for (const f of files) {
    const hits = await x(ssh, `grep -cE "whitespace-pre-wrap|font-extrabold" "${f}" 2>/dev/null || echo 0`);
    const kb = await x(ssh, `du -k "${f}" | cut -f1`);
    const name = f.startsWith('/') ? path.basename(f) : f;
    console.log(`  [REMOTE] ${name}  size=${kb}KB  fingerprint_hits=${hits}`);
  }
  const ld = 'd:/AEO/SEO V2/dist/assets';
  for (const f of fs.readdirSync(ld).filter(x => x.startsWith('WritePage.') && x.endsWith('.js'))) {
    const c = fs.readFileSync(path.join(ld, f), 'utf8');
    const h = (c.match(/whitespace-pre-wrap|font-extrabold/g) || []).length;
    console.log(`  [LOCAL ] ${f}  size=${Math.round(fs.statSync(path.join(ld, f)).size / 1024)}KB  fingerprint_hits=${h}`);
  }
  // Now: delete old remote files first, then REUPLOAD just WritePage + index + 404 SPA files to force new hashes in prod
  console.log('\n[FIX] Cleanup stale remote assets (only WritePage*, index*, vendor*, SPA fallbacks) then re-upload...');
  // Step A: delete existing WritePage files on remote
  if (files.length) { await x(ssh, `rm -f ${files.join(' ')}`); console.log('  → Deleted ' + files.length + ' stale WritePage bundles'); }
  // Also delete index + trpc-vendor bundles so they get fresh timestamp hashes
  const staleOthers = (await x(ssh, `ls -1 ${REMOTE_DIR}/index.*.js ${REMOTE_DIR}/trpc-vendor.*.js 2>/dev/null`)).split(/\n+/).filter(Boolean);
  if (staleOthers.length) { await x(ssh, `rm -f ${staleOthers.join(' ')}`); console.log('  → Deleted ' + staleOthers.length + ' stale index/vendor bundles'); }
  // Step B: upload fresh local WritePage + index + trpc-vendor files
  const sftp = ssh.sftp();
  const importantFiles = ['WritePage', 'index', 'trpc-vendor', 'KeywordClusterPlanner'];
  let uploaded = 0;
  for (const f of fs.readdirSync(ld).filter(x => importantFiles.some(p => x.startsWith(p + '.')) && (x.endsWith('.js') || x.endsWith('.css') || x.endsWith('.map')))) {
    const rp = `${REMOTE_DIR}/${f}`;
    await sftp.fastPut(path.join(ld, f), rp, { concurrency: 32, chunkSize: 131072 });
    uploaded++;
  }
  // Also upload SPA HTML fallbacks (index/404/login/projects/kcp/system) in dist/
  const spaLocalDir = 'd:/AEO/SEO V2/dist';
  for (const spaF of ['index.html','404.html','login.html','projects/index.html','kcp/index.html','system/index.html']) {
    const localSpa = path.join(spaLocalDir, spaF);
    if (!fs.existsSync(localSpa)) continue;
    if (spaF.includes('/')) {
      await x(ssh, `mkdir -p "/home/ubuntu/eeat-studio-v2/dist/${path.dirname(spaF)}" 2>/dev/null || true`);
    }
    await sftp.fastPut(localSpa, `/home/ubuntu/eeat-studio-v2/dist/${spaF}`, { concurrency: 32, chunkSize: 65536 });
    uploaded++;
  }
  console.log('  → Fresh re-uploaded ' + uploaded + ' key assets/SPA files');
  // Step C: Verify fingerprint on NEW remote WritePage
  const newFiles = (await x(ssh, `ls -1 ${REMOTE_DIR}/WritePage.*.js 2>/dev/null`)).split(/\n+/).filter(Boolean);
  for (const f of newFiles) {
    const hits = await x(ssh, `grep -cE "whitespace-pre-wrap|font-extrabold" "${f}" 2>/dev/null || echo 0`);
    const kb = await x(ssh, `du -k "${f}" | cut -f1`);
    console.log(`  [REMOTE NEW] ${path.basename(f)}  size=${kb}KB  fingerprint_hits=${hits}`);
    if (parseInt(hits,10) <= 0) process.exitCode = 6;
  }
  await ssh.close();
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
