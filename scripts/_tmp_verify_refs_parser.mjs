// Quick verify references list parser classes exist in NEW WritePage bundle
import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 20000 };
async function main(){
  const ssh = new ssh2(SSH_CFG); await ssh.connect();
  const fileGlob = '/home/ubuntu/eeat-studio-v2/dist/assets/WritePage.*.js';
  const marker = await ssh.exec(`grep -cF "marker" ${fileGlob} 2>/dev/null || echo 0`);
  const listdisc = await ssh.exec(`grep -cF "list-disc" ${fileGlob} 2>/dev/null || echo 0`);
  const files = await ssh.exec(`ls -1 ${fileGlob} 2>/dev/null`);
  const size = await ssh.exec(`du -k ${fileGlob} | cut -f1`);
  console.log(`WritePage files on remote: ${files.trim().split(/\n/).filter(Boolean).join(', ')} size=${size}KB`);
  console.log(`FINGERPRINT REFERENCES PARSER: marker_class_hits=${marker.trim()} list_disc_class_hits=${listdisc.trim()}`);
  const pass = parseInt(String(marker),10) > 0 && parseInt(String(listdisc),10) > 0;
  console.log(pass ? '✅ PARSER FEATURES UPLOADED (references list bullet renderer present)' : '❌ MISSING');
  process.exitCode = pass ? 0 : 5;
  await ssh.close();
}
main().catch(e=>{console.error(e.message);process.exitCode=2});
