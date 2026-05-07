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

## Evals i CI/CD (ARCH-97)

### Hvornår kører hvad

| Pipeline | Kommando | Live API-kald | Blokerer |
|---|---|---|---|
| `ci.yml` (alle PR + push til main) | `bun run evals` | Nej (mock) | Ja — fejl stopper CI |
| `deploy.yml` (push til main) | `EVAL_LIVE=true bun run evals` | Ja | Ja — fejl stopper deploy |

Mock-evals kræver ingen secrets. Live-evals kræver `ANTHROPIC_API_KEY` + `DATAFORDELER_API_KEY`.

### Snapshots

Snapshots gemmes i `evals/snapshots/` og skal committes — de registrerer baseline-scores og opdager regressioner. Filen er ikke ekskluderet af `.gitignore`.

**Opdatér snapshots** ved intentionelle forbedringer (ny model, bedre prompt):

```bash
EVAL_UPDATE_SNAPSHOTS=true bun run evals
git add evals/snapshots/
git commit -m "chore: opdatér eval-snapshots efter [hvad der ændrede sig]"
```

**Kør én bestemt suite** under udvikling:

```bash
bun run evals --suite=pdf-extractor
bun run evals --suite=compliance
```

### Tilføj ny eval-suite

1. Opret `evals/cases/<navn>.eval.ts` med `EvalSuite`-type
2. Importér og tilføj til `ALL_SUITES` i `evals/runner.ts`
3. Kør `EVAL_UPDATE_SNAPSHOTS=true bun run evals` for at gemme initial baseline

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
