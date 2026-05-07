# CI/CD & Integrationsopsætning

> Dette dokument indeholder opsætningsvejledninger. Det er **ikke** agent-guidance — se CLAUDE.md for det.

## GitHub Secrets der skal sættes

```
CLOUDFLARE_API_TOKEN         # Workers:Edit permission
DATAFORDELER_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PUBLISHABLE_KEY
ANTHROPIC_API_KEY
SENTRY_AUTH_TOKEN            # Source map upload i deploy.yml
LINEAR_API_KEY               # sentry-to-linear.yml + github-to-linear.yml
GITHUB_DISPATCH_TOKEN        # GitHub PAT med repo scope (ARCH-74)
```

## Branch protection

Kør `setup-branch-protection.yml` via Actions → Run workflow. Herefter kræves PR + grøn CI for merge til main.

## Sentry → Linear

Brug Sentry's native Linear integration: Sentry → Settings → Integrations → Linear → Installer. Opret Alert Rule med "Create Linear Issue" (filter: level=error/fatal, first seen).

Manuel test:
```bash
gh workflow run sentry-to-linear.yml -f title="Test" -f environment="production"
```

## Linear ↔ GitHub sync (ARCH-74)

1. Opret GitHub PAT (fine-grained, `Contents: Write`). Gem som `GITHUB_DISPATCH_TOKEN` i GitHub Secrets og Wrangler secret.
2. Opret Linear webhook (Linear → Settings → API → Webhooks):
   - URL: `https://archai-your-design-partner.workers.dev/api/webhooks/linear`
   - Events: `Issues` (state changed)
   - Kopier signing secret → `LINEAR_WEBHOOK_SECRET` i Wrangler secret

Manuel test:
```bash
gh api repos/krosen305/archai-your-design-partner/dispatches \
  --method POST \
  -f event_type=linear-issue-in-progress \
  -F client_payload[issueId]=ARCH-99 \
  -F client_payload[issueTitle]="Test"
```

## Preview deploys

`wrangler deploy --name archai-preview-pr-<N>` — kræver Cloudflare Workers-plan der tillader flere workers.

## wrangler.toml

Sæt `account_id` til din Cloudflare-konto-ID inden første deploy.

## Supabase type-generation

```bash
# Kør efter hver migration:
supabase gen types typescript --local > src/types/supabase.ts
```

Tilføj til `package.json`:
```json
"db:types": "supabase gen types typescript --local > src/types/supabase.ts"
```
