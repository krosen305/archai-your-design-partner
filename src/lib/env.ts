// SERVER-SIDE ONLY — called at module initialisation of analysis-orchestrator.ts.
// Validates that all required environment variables are present and throws a
// descriptive error listing every missing variable so the developer knows
// exactly what to add to .env.local.

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'ANTHROPIC_API_KEY',
  'DATAFORDELER_API_KEY',
] as const;

export function validateEnv(): void {
  const env = (process as any)?.env ?? {};
  const missing = REQUIRED_ENV_VARS.filter((key) => !env[key]);

  if (missing.length === 0) return;

  throw new Error(
    [
      'ArchAI: manglende miljøvariabler ved opstart:',
      ...missing.map((k) => `  • ${k}`),
      '',
      'Kopiér .env.example til .env.local og udfyld værdierne.',
    ].join('\n')
  );
}
