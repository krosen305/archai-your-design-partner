import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const DEFAULT_EMAIL = "archai.e2e@archai.test";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function generatePassword(): string {
  return `ArchAI-e2e-${randomBytes(24).toString("base64url")}!9`;
}

function readEnvFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  return `${content}${separator}${line}\n`;
}

async function main() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requireEnv("SUPABASE_SECRET_KEY");
  const publishableKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");

  const email = process.env.PLAYWRIGHT_TEST_EMAIL?.trim() || DEFAULT_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() || generatePassword();

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { purpose: "playwright-e2e" },
    });
    if (error) throw error;
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: "playwright-e2e" },
    });
    if (error) throw error;
  }

  const browserClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await browserClient.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  let envContent = readEnvFile(ENV_PATH);
  envContent = upsertEnvValue(envContent, "PLAYWRIGHT_TEST_EMAIL", email);
  envContent = upsertEnvValue(envContent, "PLAYWRIGHT_TEST_PASSWORD", password);
  writeFileSync(ENV_PATH, envContent, "utf8");

  process.stdout.write(`Playwright test user ready: ${email}\n`);
  process.stdout.write("Credentials written to .env.local as PLAYWRIGHT_TEST_EMAIL/PASSWORD\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Could not ensure Playwright test user: ${message}\n`);
  process.exit(1);
});
