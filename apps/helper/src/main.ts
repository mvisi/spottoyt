import { config } from "./config";
import { handle } from "./server";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: config.port,
  fetch: handle,
});

console.log(`SpottoYT helper listening on ${server.url}`);
