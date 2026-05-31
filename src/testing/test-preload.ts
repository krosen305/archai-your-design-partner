// Global bun:test preload — runs once before any test file is loaded.
//
// Several integration tests replace `globalThis.fetch` with a mock. Bun runs all
// test files in a single process, so a fetch mock that is not restored leaks into
// later files. The leak is order-dependent and only surfaced under CI's Linux file
// ordering (the DAR / Datafordeler address tests received a polluted fetch and
// failed, while passing locally on Windows).
//
// Capturing the genuine fetch here (before any test can mock it) and restoring it
// after every test guarantees each test starts from a clean fetch, independent of
// file order. Pure JS, no DOM — safe for every unit test.

import { afterEach } from "bun:test";

const REAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});
