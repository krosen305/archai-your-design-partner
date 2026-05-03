// ARCH-74: Linear webhook bridge — receives Linear Issue webhooks and fires
// a GitHub repository_dispatch to trigger branch auto-creation.
//
// ARCH-92: Fail closed — rejects all requests when LINEAR_WEBHOOK_SECRET is
// not configured. The secret must always be present; the handler never
// accepts unsigned payloads.

export interface LinearWebhookEnv {
  LINEAR_WEBHOOK_SECRET?: string; // HMAC signing secret from Linear webhook config
  GITHUB_DISPATCH_TOKEN?: string; // GitHub PAT with repo Contents:write scope
  GITHUB_REPO?: string; // "owner/repo" — defaults to krosen305/archai-your-design-partner
}

// fetchFn is injectable for testing; defaults to globalThis.fetch in production.
export async function handleLinearWebhook(
  request: Request,
  env: LinearWebhookEnv,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  // ARCH-92: Fail closed — require signing secret to be configured.
  // Never accept unsigned payloads even in development.
  if (!env.LINEAR_WEBHOOK_SECRET) {
    console.error("[LinearWebhook] LINEAR_WEBHOOK_SECRET ikke konfigureret — afviser request");
    return new Response("Webhook ikke konfigureret", { status: 503 });
  }

  const body = await request.text();

  // Valider HMAC-SHA256 signatur (altid kørt — secret er garanteret sat nu)
  const signature = request.headers.get("Linear-Signature") ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.LINEAR_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (signature !== expected) {
    return new Response("Ugyldig signatur", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return new Response("Ugyldig JSON", { status: 400 });
  }

  // Kun Issue-events
  if (payload.type !== "Issue" || payload.action !== "update") {
    return new Response("OK", { status: 200 });
  }

  const data = payload.data as Record<string, unknown> | undefined;
  const state = data?.state as Record<string, unknown> | undefined;
  const updatedFrom = payload.updatedFrom as Record<string, unknown> | undefined;

  // Kør kun når tilstanden skiftede til "In Progress" (type: started)
  if (
    !updatedFrom?.stateId ||
    state?.type !== "started" ||
    state?.name !== "In Progress"
  ) {
    return new Response("OK", { status: 200 });
  }

  const issueId = data?.identifier as string | undefined;
  const issueTitle = data?.title as string | undefined;
  const branchName = data?.branchName as string | undefined;

  if (!issueId) {
    return new Response("Mangler issue identifier", { status: 400 });
  }

  const repo = env.GITHUB_REPO ?? "krosen305/archai-your-design-partner";
  const token = env.GITHUB_DISPATCH_TOKEN;

  if (!token) {
    console.warn("[LinearWebhook] GITHUB_DISPATCH_TOKEN ikke sat — springer branch-oprettelse over");
    return new Response("OK (ingen GitHub token)", { status: 200 });
  }

  const dispatchRes = await fetchFn(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: "linear-issue-in-progress",
      client_payload: { issueId, issueTitle: issueTitle ?? "", branchName: branchName ?? "" },
    }),
  });

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    console.error("[LinearWebhook] GitHub dispatch fejlede:", dispatchRes.status, text);
    return new Response("GitHub dispatch fejlede", { status: 502 });
  }

  console.log(`[LinearWebhook] Branch-oprettelse udløst for ${issueId}`);
  return new Response("OK", { status: 200 });
}
