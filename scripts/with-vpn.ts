// Runs a command with the wireproxy tunnel up, and stops the tunnel when the
// command ends or the terminal goes away. If a tunnel is already listening
// (you started `bun run vpn` yourself), it's used and left running.
//
//   bun scripts/with-vpn.ts <command...>
import { homedir } from "node:os";
import type { Subprocess } from "bun";

const command = Bun.argv.slice(2);
if (!command.length) {
  console.error("Usage: bun scripts/with-vpn.ts <command...>");
  process.exit(1);
}

const proxy = new URL(process.env.HTTPS_PROXY ?? "http://127.0.0.1:25345");
const hostname = proxy.hostname;
const port = Number(proxy.port);
const config = `${homedir()}/.config/spottoyt/wireproxy.conf`;

async function tunnelUp() {
  try {
    const socket = await Bun.connect({ hostname, port, socket: { data() {} } });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

let tunnel: Subprocess | undefined;
let stopping = false;
if (await tunnelUp()) {
  console.log(`[vpn] wireproxy is already running on ${proxy.host}, using it`);
} else {
  tunnel = Bun.spawn(["wireproxy", "-s", "-c", config], {
    stdio: ["ignore", "inherit", "pipe"],
  });
  // Our port check connects and hangs up, which wireproxy logs as an error.
  void (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of tunnel.stderr as ReadableStream<Uint8Array>) {
      const text = decoder
        .decode(chunk)
        .split("\n")
        .filter((line) => line && !line.endsWith("read request failed: EOF"))
        .join("\n");
      if (text) process.stderr.write(`${text}\n`);
    }
  })();
  let exited = false;
  tunnel.exited.then(() => {
    exited = true;
  });
  const deadline = Date.now() + 5000;
  while (!(await tunnelUp())) {
    if (exited || Date.now() > deadline) {
      tunnel.kill();
      console.error(`[vpn] wireproxy didn't start (config: ${config})`);
      process.exit(1);
    }
    await Bun.sleep(100);
  }
  console.log(`[vpn] wireproxy started on ${proxy.host}`);
  tunnel.exited.then((code) => {
    if (!stopping) console.error(`[vpn] wireproxy exited (${code})`);
  });
}

const child = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"] });

const stop = () => {
  stopping = true;
  child.kill();
  tunnel?.kill();
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, stop);
}

const code = await child.exited;
stopping = true;
tunnel?.kill();
await tunnel?.exited;
process.exit(code);
