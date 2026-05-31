import { expect, type Page } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";

const DEFAULT_TEST_ADDRESS_QUERY = "Hasselvej 48, 2830 Virum";
const DEFAULT_TEST_ADDRESS_MATCH = "Hasselvej 48";

export function hasPlaywrightTestUser() {
  return Boolean(process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD);
}

export async function clearBrowserState(page: Page) {
  await page.context().clearCookies();
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

function requireTestEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} mangler`);
  return value;
}

function getSupabaseBrowserConfig() {
  const url = process.env.VITE_SUPABASE_URL?.trim() || requireTestEnv("SUPABASE_URL");
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || requireTestEnv("SUPABASE_PUBLISHABLE_KEY");
  const projectRef = new URL(url).hostname.split(".")[0];
  return { url, key, storageKey: `sb-${projectRef}-auth-token` };
}

async function createPlaywrightSession(): Promise<{ storageKey: string; session: Session }> {
  const email = requireTestEnv("PLAYWRIGHT_TEST_EMAIL");
  const password = requireTestEnv("PLAYWRIGHT_TEST_PASSWORD");
  const { url, key, storageKey } = getSupabaseBrowserConfig();

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) {
    throw new Error("Supabase returnerede ingen session for Playwright-testbrugeren");
  }
  return { storageKey, session: data.session };
}

export async function loginAsPlaywrightTestUser(page: Page): Promise<Session> {
  const { storageKey, session } = await createPlaywrightSession();

  await clearBrowserState(page);
  await page.addInitScript(
    ({ authStorageKey, authSession }) => {
      window.localStorage.setItem(authStorageKey, JSON.stringify(authSession));
      window.sessionStorage.removeItem("archai:guestMode");
    },
    { authStorageKey: storageKey, authSession: session },
  );
  await page.goto("/projekt/start");
  await expect(page.getByRole("button", { name: /Nyt projekt/i })).toBeVisible();
  return session;
}

function literalPattern(text: string) {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export async function enterCockpitWithAddress(page: Page): Promise<Session> {
  const session = await loginAsPlaywrightTestUser(page);

  await page.getByRole("button", { name: /Nyt projekt/i }).click();
  await page.waitForURL(/\/projekt\/adresse/, { timeout: 15_000 });

  const query = process.env.PLAYWRIGHT_TEST_ADDRESS_QUERY || DEFAULT_TEST_ADDRESS_QUERY;
  const match = process.env.PLAYWRIGHT_TEST_ADDRESS_MATCH || DEFAULT_TEST_ADDRESS_MATCH;

  await page.getByTestId("address-search-input").fill(query);
  const suggestion = page
    .getByTestId("address-suggestion")
    .filter({ hasText: literalPattern(match) })
    .first();
  await expect(suggestion).toBeVisible({ timeout: 15_000 });
  await suggestion.click();

  await page.getByTestId("continue-btn").click();
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 60_000 });
  return session;
}

function parseProjectIdRow(value: unknown): string {
  if (value && typeof value === "object" && "id" in value) {
    const id = value.id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  throw new Error("Kunne ikke finde seneste projekt-id for Playwright-testbrugeren");
}

async function loadLatestProjectId(session: Session): Promise<string> {
  const { url, key } = getSupabaseBrowserConfig();
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return parseProjectIdRow(data);
}

/**
 * Reach the interactive floor-plan editor with a real authenticated user and a
 * project created through the address flow.
 */
export async function openFloorPlanEditorWithPlan(page: Page) {
  const session = await enterCockpitWithAddress(page);

  const routeId = page.url().match(/\/projekt\/([^/]+)\/cockpit/)?.[1];
  if (!routeId) throw new Error(`Kunne ikke udlede adresse-id fra ${page.url()}`);
  const projectId = await loadLatestProjectId(session);

  // A hard navigation resets the in-memory project store, so the editor needs
  // the project id passed explicitly via search param to render the form.
  await page.goto(`/projekt/${routeId}/plantegning?projectId=${projectId}`);
  await page.waitForLoadState("networkidle");

  const generateBtn = page.getByRole("button", { name: /Generer plantegning/i });
  await generateBtn.waitFor({ state: "visible", timeout: 10_000 });
  await expect(generateBtn).toBeEnabled();
  await generateBtn.click();

  await page
    .locator('svg[aria-label="Interaktiv plantegning"]')
    .waitFor({ state: "visible", timeout: 20_000 });
}
