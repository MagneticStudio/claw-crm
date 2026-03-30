import { test, expect } from "@playwright/test";

const MCP_URL = "http://localhost:3000/mcp/622ed3f5177354c59c67c85b8ad4592e";

test.describe("MCP Endpoint", () => {
  test("responds to initialize request", async ({ request }) => {
    const res = await request.post(MCP_URL, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "playwright-test", version: "1.0" },
        },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("claw-crm");
    expect(body).toContain("protocolVersion");
  });

  test("rejects invalid token", async ({ request }) => {
    const res = await request.post("http://localhost:3000/mcp/invalid-token", {
      headers: { "Content-Type": "application/json" },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });

    expect(res.status()).toBe(404);
  });
});
