const { spawn } = require("child_process");
const tool = process.argv[2];
const args = JSON.parse(process.argv[3] || "{}");
const cp = spawn("C:/Users/michi/.bun/bin/bun.exe", ["core/commands/mcp-server.ts", "--stdio"], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
function send(msg) {
  const s = JSON.stringify(msg);
  cp.stdin.write("Content-Length: " + Buffer.byteLength(s) + "\r\n\r\n" + s);
}
function onBody(body) {
  const msg = JSON.parse(body);
  if (msg.result && msg.result.protocolVersion) {
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } });
    return;
  }
  if (msg.id === 2) {
    process.stdout.write(JSON.stringify(msg.result, null, 2));
    cp.kill();
    process.exit(0);
  }
}
cp.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  while (true) {
    const idx = buf.indexOf("\r\n\r\n");
    if (idx < 0) break;
    const header = buf.slice(0, idx);
    const match = /Content-Length: (\d+)/i.exec(header);
    if (!match) break;
    const len = Number(match[1]);
    const start = idx + 4;
    if (buf.length < start + len) break;
    const body = buf.slice(start, start + len);
    buf = buf.slice(start + len);
    onBody(body);
  }
});
cp.stderr.on("data", () => {});
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "codex-test", version: "1.0.0" } } });
setTimeout(() => {
  console.error("timeout");
  cp.kill();
  process.exit(1);
}, 12000);
