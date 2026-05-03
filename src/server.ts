// Custom server entry — wraps TanStack Start's default handler med Sentry.
// TanStack Start bruger denne fil automatisk fordi den ligger på src/server.ts.
// withSentry instrumenterer fetch-handleren og sikrer at uncaught exceptions
// rapporteres til Sentry, inkl. ctx.waitUntil() flush inden Worker terminerer.

import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { withSentry } from "@sentry/cloudflare";

interface CloudflareEnv {
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
}

export default withSentry(
  (env: CloudflareEnv) => ({
    dsn: env.SENTRY_DSN ?? "",
    environment: env.ENVIRONMENT ?? "production",
    tracesSampleRate: 0.1,
  }),
  { fetch: createStartHandler(defaultStreamHandler) },
);
