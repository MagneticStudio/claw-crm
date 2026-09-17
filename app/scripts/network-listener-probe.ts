import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

// Runs inside the disposable app container, where its interface address models
// traffic arriving through Docker/Railway rather than through app loopback.
const address = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === "IPv4" && !entry.internal)?.address;
assert.ok(address, "Container must have a non-loopback IPv4 interface");
const railway = JSON.parse(readFileSync("railway.json", "utf8")) as {
  deploy: { startCommand: string };
};

for (const mode of ["unset", "empty", "wildcard", "railway"] as const) {
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: "3001", NODE_ENV: "production" };
  delete env.HOST;
  if (mode === "empty") env.HOST = "";
  if (mode === "wildcard") env.HOST = "0.0.0.0";
  // Ensure Railway's command supplies its own host even outside our Dockerfile.
  if (mode === "railway") env.HOST = "127.0.0.1";
  const command = mode === "railway" ? railway.deploy.startCommand.split(/\s+/) : ["node", "dist/index.js"];
  const child = spawn(command[0], command.slice(1), { env, detached: true, stdio: "pipe" });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = once(child, "exit");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      assert.equal(child.exitCode, null, `App exited in ${mode} mode: ${output}`);
      try {
        ready = (await fetch("http://127.0.0.1:3001/api/config", { signal: AbortSignal.timeout(1000) })).ok;
      } catch {
        // Wait for the actual application, including boot migrations.
      }
      if (ready) break;
      await delay(250);
    }
    assert.ok(ready, `App did not become ready in ${mode} mode: ${output}`);
    const remote = () => fetch(`http://${address}:3001/api/config`, { signal: AbortSignal.timeout(2000) });
    if (mode === "unset" || mode === "empty") {
      await assert.rejects(remote, "Default listener must reject non-loopback traffic");
      await assert.rejects(
        () => fetch("http://[::1]:3001/api/config", { signal: AbortSignal.timeout(2000) }),
        "IPv4 loopback default must not open an IPv6 wildcard listener",
      );
    } else {
      assert.equal((await remote()).status, 200, `${mode} must preserve container ingress`);
    }
    console.warn(`PASS: ${mode} listener`);
  } finally {
    if (child.pid && child.exitCode === null) process.kill(-child.pid, "SIGTERM");
    await exited;
  }
}
