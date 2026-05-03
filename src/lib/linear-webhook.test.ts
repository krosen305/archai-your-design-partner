import { describe, it, expect, mock } from "bun:test";
import { handleLinearWebhook } from "./linear-webhook";

const TEST_SECRET = "test-webhook-secret";
const TEST_TOKEN = "ghp_testtoken";
const TEST_REPO = "owner/repo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function computeSignature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeRequest(body: string, secret: string): Promise<Request> {
  const sig = await computeSignature(body, secret);
  return new Request("http://localhost/api/webhooks/linear", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Linear-Signature": sig },
    body,
  });
}

const IN_PROGRESS_PAYLOAD = JSON.stringify({
  type: "Issue",
  action: "update",
  data: {
    identifier: "ARCH-99",
    title: "Test issue",
    branchName: "krosenmejer/arch-99-test-issue",
    state: { type: "started", name: "In Progress" },
  },
  updatedFrom: { stateId: "previous-state-id" },
});

const okFetch = mock(async () => new Response("", { status: 204 }));

// ---------------------------------------------------------------------------
// ARCH-92: Fail closed — missing secret
// ---------------------------------------------------------------------------

describe("ARCH-92: missing LINEAR_WEBHOOK_SECRET", () => {
  it("returnerer 503 når secret ikke er sat", async () => {
    const req = new Request("http://localhost/api/webhooks/linear", {
      method: "POST",
      body: IN_PROGRESS_PAYLOAD,
    });
    const res = await handleLinearWebhook(req, {}, okFetch);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("ikke konfigureret");
  });

  it("returnerer 503 når secret er tom streng", async () => {
    const req = new Request("http://localhost/api/webhooks/linear", {
      method: "POST",
      body: IN_PROGRESS_PAYLOAD,
    });
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: "" }, okFetch);
    expect(res.status).toBe(503);
  });

  it("kalder aldrig GitHub dispatch når secret mangler", async () => {
    const fetchSpy = mock(async () => new Response("", { status: 204 }));
    const req = new Request("http://localhost/api/webhooks/linear", {
      method: "POST",
      body: IN_PROGRESS_PAYLOAD,
    });
    await handleLinearWebhook(
      req,
      { LINEAR_WEBHOOK_SECRET: undefined, GITHUB_DISPATCH_TOKEN: TEST_TOKEN },
      fetchSpy,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Signature validation
// ---------------------------------------------------------------------------

describe("signatur-validering", () => {
  it("accepterer request med korrekt HMAC-signatur", async () => {
    const req = await makeRequest(IN_PROGRESS_PAYLOAD, TEST_SECRET);
    const res = await handleLinearWebhook(
      req,
      { LINEAR_WEBHOOK_SECRET: TEST_SECRET },
      okFetch,
    );
    // 200 (ingen GitHub token, men signatur OK)
    expect(res.status).toBe(200);
  });

  it("afviser request med forkert signatur (401)", async () => {
    const req = new Request("http://localhost/api/webhooks/linear", {
      method: "POST",
      headers: { "Linear-Signature": "deadbeef" },
      body: IN_PROGRESS_PAYLOAD,
    });
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(401);
  });

  it("afviser request uden signatur-header (401)", async () => {
    const req = new Request("http://localhost/api/webhooks/linear", {
      method: "POST",
      body: IN_PROGRESS_PAYLOAD,
    });
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(401);
  });

  it("afviser request hvor body er ændret efter signering (401)", async () => {
    const sig = await computeSignature(IN_PROGRESS_PAYLOAD, TEST_SECRET);
    const req = new Request("http://localhost/api/webhooks/linear", {
      method: "POST",
      headers: { "Linear-Signature": sig },
      body: IN_PROGRESS_PAYLOAD + " ", // tampered
    });
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Payload-filtrering
// ---------------------------------------------------------------------------

describe("payload-filtrering", () => {
  it("returnerer 400 ved ugyldig JSON", async () => {
    const req = await makeRequest("not-json", TEST_SECRET);
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(400);
  });

  it("ignorerer non-Issue events (200)", async () => {
    const body = JSON.stringify({ type: "Comment", action: "create" });
    const req = await makeRequest(body, TEST_SECRET);
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(200);
  });

  it("ignorerer non-update actions (200)", async () => {
    const body = JSON.stringify({ type: "Issue", action: "create" });
    const req = await makeRequest(body, TEST_SECRET);
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(200);
  });

  it("ignorerer issue der ikke skifter state (ingen updatedFrom.stateId)", async () => {
    const body = JSON.stringify({
      type: "Issue",
      action: "update",
      data: { state: { type: "started", name: "In Progress" } },
      updatedFrom: {},
    });
    const req = await makeRequest(body, TEST_SECRET);
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(200);
  });

  it("ignorerer state-skift til andet end In Progress", async () => {
    const body = JSON.stringify({
      type: "Issue",
      action: "update",
      data: { state: { type: "completed", name: "Done" } },
      updatedFrom: { stateId: "old-id" },
    });
    const req = await makeRequest(body, TEST_SECRET);
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(200);
  });

  it("ignorerer state-type 'started' med andet navn end In Progress", async () => {
    const body = JSON.stringify({
      type: "Issue",
      action: "update",
      data: { state: { type: "started", name: "In Review" } },
      updatedFrom: { stateId: "old-id" },
    });
    const req = await makeRequest(body, TEST_SECRET);
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(200);
  });

  it("returnerer 400 når issue identifier mangler", async () => {
    const body = JSON.stringify({
      type: "Issue",
      action: "update",
      data: {
        // identifier mangler
        state: { type: "started", name: "In Progress" },
      },
      updatedFrom: { stateId: "old-id" },
    });
    const req = await makeRequest(body, TEST_SECRET);
    const res = await handleLinearWebhook(req, { LINEAR_WEBHOOK_SECRET: TEST_SECRET }, okFetch);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GitHub dispatch
// ---------------------------------------------------------------------------

describe("GitHub dispatch", () => {
  const env = {
    LINEAR_WEBHOOK_SECRET: TEST_SECRET,
    GITHUB_DISPATCH_TOKEN: TEST_TOKEN,
    GITHUB_REPO: TEST_REPO,
  };

  it("kalder GitHub dispatch med korrekt payload ved In Progress", async () => {
    const fetchSpy = mock(async () => new Response("", { status: 204 }));
    const req = await makeRequest(IN_PROGRESS_PAYLOAD, TEST_SECRET);
    const res = await handleLinearWebhook(req, env, fetchSpy);

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/${TEST_REPO}/dispatches`);
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body as string);
    expect(body.event_type).toBe("linear-issue-in-progress");
    expect(body.client_payload.issueId).toBe("ARCH-99");
    expect(body.client_payload.branchName).toBe("krosenmejer/arch-99-test-issue");
  });

  it("returnerer 200 (no-op) når GITHUB_DISPATCH_TOKEN ikke er sat", async () => {
    const fetchSpy = mock(async () => new Response("", { status: 204 }));
    const req = await makeRequest(IN_PROGRESS_PAYLOAD, TEST_SECRET);
    const res = await handleLinearWebhook(
      req,
      { LINEAR_WEBHOOK_SECRET: TEST_SECRET },
      fetchSpy,
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returnerer 502 når GitHub dispatch fejler", async () => {
    const fetchSpy = mock(async () => new Response("Not Found", { status: 404 }));
    const req = await makeRequest(IN_PROGRESS_PAYLOAD, TEST_SECRET);
    const res = await handleLinearWebhook(req, env, fetchSpy);
    expect(res.status).toBe(502);
  });

  it("bruger default repo når GITHUB_REPO ikke er sat", async () => {
    const fetchSpy = mock(async () => new Response("", { status: 204 }));
    const req = await makeRequest(IN_PROGRESS_PAYLOAD, TEST_SECRET);
    await handleLinearWebhook(
      req,
      { LINEAR_WEBHOOK_SECRET: TEST_SECRET, GITHUB_DISPATCH_TOKEN: TEST_TOKEN },
      fetchSpy,
    );
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("krosen305/archai-your-design-partner");
  });
});
