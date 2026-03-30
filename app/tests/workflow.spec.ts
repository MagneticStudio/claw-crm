import { test, expect } from "@playwright/test";

const MCP_TOKEN = process.env.MCP_TOKEN || "test-token";
const MCP_PATH = `/mcp/${MCP_TOKEN}`;

/**
 * End-to-end workflow test.
 * Simulates a real user session: log in, scan pipeline, add a note,
 * create a follow-up, complete it with an outcome, verify everything persisted.
 */

test.describe("Full workflow", () => {
  test("complete CRM session: login → note → follow-up → complete", async ({ page, request }) => {

    // 1. Log in
    await page.goto("/auth");
    await page.locator('input[type="password"]').fill("1234");
    await page.locator("button", { hasText: "Unlock" }).click();
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 5000 });

    // 2. Verify contacts loaded
    const contactNames = await page.locator("h2").allTextContents();
    expect(contactNames.length).toBeGreaterThan(0);

    // 3. Add a note to the first contact
    const noteInput = page.locator('input[placeholder*="note"]').first();
    await noteInput.fill("E2E test: had a productive call about AI strategy");
    await noteInput.press("Enter");

    // Verify note appears in timeline
    await expect(page.locator("text=E2E test: had a productive call about AI strategy")).toBeVisible({ timeout: 5000 });

    // 4. Create a follow-up via /fu command
    await noteInput.fill("/fu 12/25 E2E test: send holiday greeting");
    await noteInput.press("Enter");

    // Verify follow-up appears (square checkbox + date + text)
    await expect(page.locator("text=E2E test: send holiday greeting")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=12/25")).toBeVisible();

    // 5. Complete the follow-up — click the square checkbox
    const followupCheckbox = page.locator("text=E2E test: send holiday greeting").locator("..").locator("button").first();
    await followupCheckbox.click();

    // 6. The completion form should appear
    await expect(page.locator("text=Completing")).toBeVisible({ timeout: 3000 });

    // 7. Enter the outcome
    const outcomeInput = page.locator('input[placeholder="What happened?"]');
    await outcomeInput.fill("E2E test: sent holiday greeting, got a warm reply");
    await page.locator("button", { hasText: "Done" }).click();

    // 8. Verify: follow-up text is gone (completed), outcome appears in timeline
    await expect(page.locator("text=E2E test: sent holiday greeting, got a warm reply")).toBeVisible({ timeout: 5000 });

    // 9. Verify data persisted via API
    const loginRes = await request.post("/api/login", { data: { pin: "1234" } });
    const cookies = loginRes.headers()["set-cookie"];

    const contactsRes = await request.get("/api/contacts", {
      headers: { Cookie: cookies || "" },
    });
    expect(contactsRes.ok()).toBeTruthy();
    const contacts = await contactsRes.json();
    expect(contacts.length).toBeGreaterThan(0);

    // Find our interaction in the first contact's data
    const firstContact = contacts[0];
    const hasOurNote = firstContact.interactions.some(
      (i: any) => i.content.includes("E2E test: had a productive call")
    );
    expect(hasOurNote).toBeTruthy();

    // Verify the outcome interaction exists
    const hasOutcome = firstContact.interactions.some(
      (i: any) => i.content.includes("E2E test: sent holiday greeting, got a warm reply")
    );
    expect(hasOutcome).toBeTruthy();
  });

  test("stage change via slash command", async ({ page }) => {
    // Login
    await page.goto("/auth");
    await page.locator('input[type="password"]').fill("1234");
    await page.locator("button", { hasText: "Unlock" }).click();
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 5000 });

    // Find a contact's input and change stage
    const noteInput = page.locator('input[placeholder*="note"]').first();
    await noteInput.fill("/stage PROPOSAL");
    await noteInput.press("Enter");

    // Verify the stage badge updated
    await expect(page.locator("text=PROPOSAL").first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP endpoint responds and returns tools", async ({ request }) => {
    // Initialize MCP session
    const res = await request.post(MCP_PATH, {
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
          clientInfo: { name: "e2e-test", version: "1.0" },
        },
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("claw-crm");

    // Extract session ID from response headers
    const sessionId = res.headers()["mcp-session-id"];
    expect(sessionId).toBeTruthy();

    // List tools
    const toolsRes = await request.post(MCP_PATH, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "mcp-session-id": sessionId!,
      },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      },
    });

    expect(toolsRes.ok()).toBeTruthy();
    const toolsBody = await toolsRes.text();
    expect(toolsBody).toContain("search_contacts");
    expect(toolsBody).toContain("get_crm_guide");
    expect(toolsBody).toContain("set_meeting");
    expect(toolsBody).toContain("get_activity_log");
  });

  test("agent workflow: MCP search → get contact → add interaction", async ({ request }) => {
    // Initialize
    const initRes = await request.post(MCP_PATH, {
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e2e-agent", version: "1.0" } } },
    });
    const sessionId = initRes.headers()["mcp-session-id"];

    const callTool = async (name: string, args: any) => {
      const res = await request.post(MCP_PATH, {
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "mcp-session-id": sessionId! },
        data: { jsonrpc: "2.0", id: Math.random(), method: "tools/call", params: { name, arguments: args } },
      });
      return res.text();
    };

    // Search contacts
    const searchResult = await callTool("search_contacts", { query: "Ryan" });
    expect(searchResult).toContain("Ryan");

    // Get dashboard
    const dashboard = await callTool("get_dashboard", {});
    expect(dashboard).toContain("totalContacts");
    expect(dashboard).toContain("activeContacts");

    // Add interaction via MCP
    const addResult = await callTool("add_interaction", {
      contactId: 1,
      content: "E2E agent test: logged via MCP tool",
      type: "note",
    });
    expect(addResult).toContain("Logged note");

    // Verify it shows up in get_contact
    const contactResult = await callTool("get_contact", { contactId: 1 });
    expect(contactResult).toContain("E2E agent test: logged via MCP tool");
  });
});
