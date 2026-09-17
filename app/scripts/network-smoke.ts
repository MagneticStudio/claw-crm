import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

interface ComposeConfig {
  services: { app: { ports: { host_ip: string; target: number; published: string }[] } };
}

const root = resolve(import.meta.dirname, "../..");
const project = `claw-network-${randomUUID().slice(0, 8)}`;
const temp = mkdtempSync(join(tmpdir(), `${project}-`));
const configPath = join(temp, "compose.json");
const env: NodeJS.ProcessEnv = { ...process.env, SESSION_SECRET: "disposable-network-test-only" };
delete env.CLAW_HTTP_BIND;
const baseArgs = ["compose", "--env-file", "/dev/null", "-p", project];
const sourceArgs = [...baseArgs, "-f", join(root, "docker-compose.yml")];
const testArgs = [...baseArgs, "-f", configPath];
function docker(args: string[], runEnv = env) {
  return execFileSync("docker", args, { env: runEnv, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}
function config(bind?: string): ComposeConfig {
  return JSON.parse(
    docker([...sourceArgs, "config", "--format", "json"], bind === undefined ? env : { ...env, CLAW_HTTP_BIND: bind }),
  ) as ComposeConfig;
}

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    if (existsSync(configPath)) docker([...testArgs, "down", "--volumes", "--remove-orphans"]);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
// Node does not execute finally on its default SIGINT/SIGTERM exit path.
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const) {
  process.once(signal, () => {
    try {
      cleanup();
    } finally {
      process.exit(code);
    }
  });
}

try {
  const composed = config();
  for (const bind of [undefined, "", "0.0.0.0", "192.0.2.10"]) {
    const port = config(bind).services.app.ports[0];
    assert.equal(port.host_ip, bind || "127.0.0.1");
    assert.equal(port.target, 3000);
    assert.equal(port.published, "3000");
  }
  console.warn("PASS: Compose absent/empty bind defaults and explicit overrides");
  // Keep the resolved host IP and container target; randomize only the host port
  // so this test never takes over a developer's running app or database volume.
  composed.services.app.ports[0].published = "0";
  writeFileSync(configPath, JSON.stringify(composed));
  execFileSync("docker", [...testArgs, "up", "--detach", "--build", "--wait", "--wait-timeout", "120"], {
    env,
    stdio: "inherit",
  });
  const published = docker([...testArgs, "port", "app", "3000"]).trim();
  assert.match(published, /^127\.0\.0\.1:\d+$/);
  const url = `http://${published}`;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      ready = (await fetch(`${url}/api/config`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      // The first boot applies the schema before accepting requests.
    }
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, "Published Docker port must reach the app");
  assert.equal((await fetch(`${url}/api/user`)).status, 401);
  const setup = await fetch(`${url}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "1234", orgName: "Disposable network test" }),
  });
  assert.equal(setup.status, 201, "Fresh Docker setup must remain usable over localhost HTTP");
  await setup.json();
  const login = await fetch(`${url}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "1234" }),
  });
  assert.equal(login.status, 200);
  // Wait for the response to finish: express-session persists before end(),
  // while fetch() can resolve as soon as headers arrive.
  await login.json();
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "Local HTTP login must issue a session cookie");
  assert.equal((await fetch(`${url}/api/user`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal(
    (
      await fetch(`${url}/api/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"pin":"9999"}',
      })
    ).status,
    400,
    "Initialized instance must still reject repeated setup",
  );
  console.warn("PASS: published container ingress, fresh setup, HTTP session login and setup lockout");
  execFileSync(
    "docker",
    [...testArgs, "exec", "-T", "app", "npx", "--no-install", "tsx", "scripts/network-listener-probe.ts"],
    {
      env,
      stdio: "inherit",
    },
  );
} finally {
  cleanup();
}
