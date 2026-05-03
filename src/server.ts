// Custom server entry — wraps TanStack Start's default handler med Sentry.
// TanStack Start bruger denne fil automatisk fordi den ligger på src/server.ts.
// withSentry instrumenterer fetch-handleren og sikrer at uncaught exceptions
// rapporteres til Sentry, inkl. ctx.waitUntil() flush inden Worker terminerer.
//
// ARCH-74: Tilføjer webhook bridge på POST /api/webhooks/linear
// Linear → (webhook) → Cloudflare Worker → GitHub repository_dispatch → GitHub Actions

import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { withSentry } from "@sentry/cloudflare";

interface CloudflareEnv {
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
  // ARCH-74: Linear webhook bridge
  LINEAR_WEBHOOK_SECRET?: string; // fra Linear Settings → API → Webhooks (signing secret)
  GITHUB_DISPATCH_TOKEN?: string; // GitHub PAT med repo scope
  GITHUB_REPO?: string; // "owner/repo" — default: "krosen305/archai-your-design-partner"
}

// ---------------------------------------------------------------------------
// Linear webhook bridge (ARCH-74)
// ---------------------------------------------------------------------------

async function handleLinearWebhook(request: Request, env: CloudflareEnv): Promise<Response> {
  const body = await request.text();

  // Valider HMAC-SHA256 signatur hvis secret er konfigureret
  if (env.LINEAR_WEBHOOK_SECRET) {
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
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return new Response("Ugyldig JSON", { status: 400 });
  }

  // Kun Issue-events hvor issue flyttes til "In Progress" (state type: started)
  if (payload.type !== "Issue" || payload.action !== "update") {
    return new Response("OK", { status: 200 });
  }

  const data = payload.data as Record<string, unknown> | undefined;
  const state = data?.state as Record<string, unknown> | undefined;
  const updatedFrom = payload.updatedFrom as Record<string, unknown> | undefined;

  // Kør kun når tilstanden faktisk ændrede sig (stateId ændret) til "started"
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

  // Udløs GitHub Actions via repository_dispatch
  const repo = env.GITHUB_REPO ?? "krosen305/archai-your-design-partner";
  const token = env.GITHUB_DISPATCH_TOKEN;

  if (!token) {
    console.warn("[LinearWebhook] GITHUB_DISPATCH_TOKEN ikke sat — kan ikke oprette branch");
    return new Response("OK (ingen GitHub token)", { status: 200 });
  }

  const dispatchRes = await globalThis.fetch(`https://api.github.com/repos/${repo}/dispatches`, {
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

// ---------------------------------------------------------------------------
// Combined fetch handler
// ---------------------------------------------------------------------------

// Cast to Cloudflare Workers fetch signature — createStartHandler handles this at runtime
// via withSentry's adapter, but its TypeScript overload is declared for the SSR use-case.
// ExecutionContext is not in tsconfig types (only vite/client), so we use unknown here.
type WorkerHandler = (req: Request, env: CloudflareEnv, ctx: unknown) => Promise<Response>;
const startFetch = createStartHandler(defaultStreamHandler) as unknown as WorkerHandler;

export default withSentry(
  (env: CloudflareEnv) => ({
    dsn: env?.SENTRY_DSN ?? "",
    environment: env?.ENVIRONMENT ?? "production",
    tracesSampleRate: 0.1,
  }),
  {
    fetch: async (request: Request, env: CloudflareEnv, ctx: unknown): Promise<Response> => {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/linear" && request.method === "POST") {
        return handleLinearWebhook(request, env);
      }
      return startFetch(request, env, ctx);
    },
  },
);
