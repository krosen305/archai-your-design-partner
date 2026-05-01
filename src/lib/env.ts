// SERVER-SIDE ONLY — called at module initialisation of analysis-orchestrator.ts.
// Validates that all required environment variables are present and throws a
// descriptive error listing every missing variable so the developer knows
// exactly what to add to .env.local.

// Disse variabler er påkrævede — mangler de kaster appen fejl ved opstart.
const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "DATAFORDELER_API_KEY",
] as const;

// Disse variabler er valgfrie — mangler de advarer appen og bruger mock-data.
// pdf-extractor.ts og hus-dna-generator.ts har begge graceful fallback til IS_MOCK.
const OPTIONAL_ENV_VARS = ["ANTHROPIC_API_KEY"] as const;

export function validateEnv(): void {
  const env = (process as any)?.env ?? {};

  const missing = REQUIRED_ENV_VARS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      [
        "ArchAI: manglende påkrævede miljøvariabler ved opstart:",
        ...missing.map((k) => `  • ${k}`),
        "",
        "Kopiér .env.example til .env.local og udfyld værdierne.",
      ].join("\n"),
    );
  }

  const missingOptional = OPTIONAL_ENV_VARS.filter((key) => !env[key]);
  if (missingOptional.length > 0) {
    console.warn(
      "[ArchAI] Valgfrie miljøvariabler mangler — AI-funktioner bruger mock-data:\n" +
        missingOptional.map((k) => `  • ${k}`).join("\n"),
    );
  }
}
