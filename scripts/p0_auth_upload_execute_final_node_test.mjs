// Upload _tmp_p0_auth_node_vps_final.mjs to VPS DEPLOY_DIR via ssh2-promise and execute
import SSHClient from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SSH = {
  host: '35.231.230.218',
  username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt',
  port: 22,
  readyTimeout: 20000,
  keepaliveInterval: 30000,
};
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';
async function sh(ssh, cmd) {
  try {
    const s = (await ssh.exec(`export PATH="${NODE_PATH}:$PATH"; ${cmd}`))?.toString?.() ??
      String(await ssh.exec(cmd));
    return s.trim();
  } catch (e) {
    return String(e?.message ?? e);
  }
}
(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok');
    const localFile = path.join(__dirname, '_tmp_p0_auth_node_vps_final.mjs');
    const content = fs.readFileSync(localFile, 'utf8');
    const sftp = ssh.sftp();
    await sftp.writeFile(`${DEPLOY_DIR}/_tmp_p0_auth_node_vps_final.mjs`, content);
    console.log(`✅ Uploaded file to ${DEPLOY_DIR}/_tmp_p0_auth_node_vps_final.mjs (${content.length} bytes)`);
    console.log('\n==== EXECUTING NODE SCRIPT ON VPS ====\n');
    const out = await sh(ssh, `cd ${DEPLOY_DIR} && node _tmp_p0_auth_node_vps_final.mjs 2>&1`);
    console.log(out);
    console.log('\n==== EXECUTION DONE ====');
    ssh.close?.();
  } catch (e) {
    console.error('FATAL:', e);
    process.exit(1);
  }
})();
