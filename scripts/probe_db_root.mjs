import SSHClient from "ssh2-promise";

const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};

async function run(cmd) {
  console.log("\n$", cmd);
  const ssh = new SSHClient(CFG);
  await ssh.connect();
  try {
    const r = await ssh.exec(cmd).catch(e => String(e?.stack || e));
    console.log(String(r));
  } finally {
    await ssh.close();
  }
}

(async () => {
  await run("echo '--- [1] docker root blank pw try:'; docker exec eeat-studio-db mariadb -uroot -e 'SELECT 1 AS try1;' 2>&1 || true");
  await run("echo '--- [2] no user root no flag:'; docker exec eeat-studio-db mariadb -uroot -e 'SELECT USER(), CURRENT_USER();' 2>&1 || true");
  await run("echo '--- [3] env inside container:'; docker exec eeat-studio-db bash -lc 'echo MYSQL=$MYSQL_ROOT_PASSWORD MARIADB=$MARIADB_ROOT_PASSWORD env | cat' 2>&1");
  await run("echo '--- [4] eeat already has global grants:'; docker exec eeat-studio-db mariadb -ueeat -p'eeat_secret_2026_Cloud!' -e 'SHOW GRANTS;' 2>&1");
  await run("echo '--- [5] eeat create schema directly (what err):'; docker exec eeat-studio-db mariadb -ueeat -p'eeat_secret_2026_Cloud!' -e 'CREATE DATABASE IF NOT EXISTS test_eeat_can_create;' 2>&1");
})();
