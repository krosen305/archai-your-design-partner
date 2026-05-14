import { logger } from "@/lib/logger";

const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "DATAFORDELER_API_KEY",
] as const;

const OPTIONAL_ENV_VARS = ["ANTHROPIC_API_KEY"] as const;

type RequiredEnvKey = (typeof REQUIRED_ENV_VARS)[number];
type OptionalEnvKey = (typeof OPTIONAL_ENV_VARS)[number];
type EnvKey = RequiredEnvKey | OptionalEnvKey | string;

function readRawEnv(): Record<string, string | undefined> {
  return (process.env ?? {}) as Record<string, string | undefined>;
}

export function getEnvOptional(key: EnvKey): string | undefined {
  return readRawEnv()[key];
}

export function getEnvRequired(key: RequiredEnvKey): string {
  const value = readRawEnv()[key];
  if (!value) throw new Error(`ArchAI: manglende miljovariabel: ${key}`);
  return value;
}

export function validateEnv(): void {
  const env = readRawEnv();
  const missingRequired = REQUIRED_ENV_VARS.filter((key) => !env[key]);
  if (missingRequired.length > 0) {
    throw new Error(
      [
        "ArchAI: manglende pakraevede miljovariabler ved opstart:",
        ...missingRequired.map((k) => `  - ${k}`),
        "",
        "Kopier .env.example til .env.local og udfyld vaerdierne.",
      ].join("\n"),
    );
  }

  const missingOptional = OPTIONAL_ENV_VARS.filter((key) => !env[key]);
  if (missingOptional.length > 0) {
    logger.warn(
      "[ArchAI] Valgfrie miljovariabler mangler - AI-funktioner bruger mock-data:\n" +
        missingOptional.map((k) => `  - ${k}`).join("\n"),
    );
  }
}
