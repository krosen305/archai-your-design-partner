// Custom server entry — wraps TanStack Start's default handler med Sentry.
// TanStack Start bruger denne fil automatisk fordi den ligger på src/server.ts.
// withSentry instrumenterer fetch-handleren og sikrer at uncaught exceptions
// rapporteres til Sentry, inkl. ctx.waitUntil() flush inden Worker terminerer.
//
// ARCH-74: Webhook bridge på POST /api/webhooks/linear (se src/lib/linear-webhook.ts)
// ARCH-92: Webhook afviser alle requests når signing secret mangler (fail closed)

import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { withSentry } from "@sentry/cloudflare";
import { handleLinearWebhook } from "@/lib/linear-webhook";

interface CloudflareEnv {
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
  LINEAR_WEBHOOK_SECRET?: string;
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_REPO?: string;
}

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
