import { test, expect } from "@playwright/test";

const API_KEY = "claw_test_key"; // Seed creates a user — we read the key from DB

test.describe("REST API", () => {
  test("GET /api/user returns 401 without auth", async ({ request }) => {
    const res = await request.get("http://localhost:3000/api/user");
    expect(res.status()).toBe(401);
  });

  test("GET /api/contacts returns 401 without auth", async ({ request }) => {
    const res = await request.get("http://localhost:3000/api/contacts");
    expect(res.status()).toBe(401);
  });

  test("POST /api/login with correct PIN returns 200", async ({ request }) => {
    const res = await request.post("http://localhost:3000/api/login", {
      data: { pin: "1234" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBeDefined();
  });

  test("POST /api/login with wrong PIN returns 401", async ({ request }) => {
    const res = await request.post("http://localhost:3000/api/login", {
      data: { pin: "0000" },
    });
    expect(res.status()).toBe(401);
  });

  // SSE endpoint streams forever — can't test with a simple request
});
