import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pool } from "./db";

interface BaseSchemaState {
  users: string | null;
  contacts: string | null;
}

async function getBaseSchemaState(): Promise<BaseSchemaState> {
  const result = await pool.query<BaseSchemaState>(
    "SELECT to_regclass('public.users')::text AS users, to_regclass('public.contacts')::text AS contacts",
  );
  return result.rows[0];
}

async function pushInitialSchema(): Promise<void> {
  const drizzleKitBin = fileURLToPath(new URL("../node_modules/drizzle-kit/bin.cjs", import.meta.url));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [drizzleKitBin, "push", "--force"], {
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Initial schema push failed (${signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`})`));
    });
  });
}

async function main(): Promise<void> {
  const before = await getBaseSchemaState();

  if (before.users && before.contacts) {
    console.warn("[schema-bootstrap] Existing database detected; skipped schema push");
    return;
  }

  if (before.users || before.contacts) {
    throw new Error(
      "Database has a partial base schema. Refusing an automatic push; restore the missing table or run the schema workflow deliberately.",
    );
  }

  console.warn("[schema-bootstrap] Empty database detected; applying the initial schema");
  await pushInitialSchema();

  const after = await getBaseSchemaState();
  if (!after.users || !after.contacts) {
    throw new Error("Initial schema push completed without creating the required base tables");
  }
  console.warn("[schema-bootstrap] Initial schema applied successfully");
}

try {
  await main();
} finally {
  await pool.end();
}
