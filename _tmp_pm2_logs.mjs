import SSHClient from "ssh2-promise";

const ssh = new SSHClient({
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
});

async function run(cmd) {
  return (await ssh.exec(cmd)).trim();
}

async function main() {
  try {
    await ssh.connect();

    console.log("--- PM2 id=84 last 200 lines (err logs) ---");
    console.log(await run("pm2 logs eeat-studio-v2 --nostream --lines 200 --err 2>&1 | tail -200"));

    console.log("\n--- PM2 id=84 combined last 150 lines ---");
    console.log(await run("pm2 logs eeat-studio-v2 --nostream --lines 150 2>&1 | tail -150"));

    console.log("\n--- /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log last 200 lines ---");
    console.log(await run("tail -200 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>&1"));

    console.log("\n--- /home/ubuntu/.pm2/logs/eeat-studio-v2-out.log last 100 lines ---");
    console.log(await run("tail -100 /home/ubuntu/.pm2/logs/eeat-studio-v2-out.log 2>&1"));
  } catch (e) {
    console.error("ERR:", e?.message || e);
    process.exit(1);
  } finally {
    ssh.close();
  }
}
main();
