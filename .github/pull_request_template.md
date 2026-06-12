## Linear issue

<!-- Indsæt link til Linear issue — hentes automatisk fra branch-navn af github-to-linear.yml -->

## Ændringer

<!-- Beskriv hvad PR'en gør -->

## Strategy preflight

- [ ] Jeg har læst `docs/LLM_OPERATING_BRIEF.md`
- [ ] Ændringen understøtter `address -> documented preliminary building screening report`
- [ ] Product surface: `Screening` / `Kildebog` / `Risikoregister` / `Rapport`
- [ ] Ændringen genaktiverer ikke paused/legacy scope uden eksplicit approval
- [ ] Output kan ikke misforstås som juridisk afgørelse eller myndighedsafgørelse
- [ ] `bun run strategy:lint`

## Test-steps

- [ ] `bun dev` — golden path virker end-to-end
- [ ] `bunx tsc --noEmit` — ingen type-fejl
- [ ] `bun test` — ingen fejlende tests
- [ ] `bunx eslint .` — ingen nye fejl
- [ ] `bun run build` — ingen build-fejl
- [ ] Ingen `console.log` eller debug-kode tilbage
- [ ] Hvis PR'en rører protected files: `🔒 Rører beskyttet fil — kræver review`
