import SSHClient from "ssh2-promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJ_ROOT = path.resolve(__dirname, "..");

const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};

async function main() {
  const ssh = new SSHClient(CFG);
  await ssh.connect();
  console.log("✅ SSH CONNECTED");
  const run = async (label, cmd) => {
    console.log("\n" + "=".repeat(70));
    console.log("  " + label);
    console.log("=".repeat(70));
    const out = (await ssh.exec(cmd).catch(e => String(e?.stack || e)));
    console.log(String(out).slice(0, 6000));
    return out;
  };
  const sftp = ssh.sftp();
  const localBash = fs.readFileSync(path.join(PROJ_ROOT,"scripts","_tmp_probe_keys.sh"), "utf8");
  await sftp.writeFile("/tmp/probe_keys_compare.sh", localBash, { mode: 0o755 });
  await run("RUN BASH /tmp/probe_keys_compare.sh", "bash /tmp/probe_keys_compare.sh 2>&1 | tail -65");
  await ssh.close();
}
main().catch(e => { console.error(e); process.exit(1); });
