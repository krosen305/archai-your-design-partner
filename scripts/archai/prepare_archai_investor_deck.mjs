import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DECK_SLUG,
  SLIDE_COUNT,
  writePlanningDocs,
  writeScorecard,
} from "./archai_investor_deck_shared.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected positional argument: ${key}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key.slice(2)] = true;
      continue;
    }
    args[key.slice(2)] = next;
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args.repo || process.cwd());
  const threadId = args["thread-id"] || process.env.CODEX_THREAD_ID || "manual";
  const workspaceDir = path.resolve(
    args.workspace || path.join(repoRoot, "outputs", threadId, "presentations", DECK_SLUG),
  );
  const slidesDir = path.join(workspaceDir, "slides");
  const previewDir = path.join(workspaceDir, "preview");
  const layoutDir = path.join(workspaceDir, "layout");
  const qaDir = path.join(workspaceDir, "qa");
  const outputDir = path.join(workspaceDir, "output");
  const assetDir = path.join(workspaceDir, "assets");

  await Promise.all([
    fs.mkdir(slidesDir, { recursive: true }),
    fs.mkdir(previewDir, { recursive: true }),
    fs.mkdir(layoutDir, { recursive: true }),
    fs.mkdir(qaDir, { recursive: true }),
    fs.mkdir(outputDir, { recursive: true }),
    fs.mkdir(assetDir, { recursive: true }),
  ]);

  await writePlanningDocs(workspaceDir);
  await writeScorecard(workspaceDir);

  const sharedPath = path.resolve(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "archai_investor_deck_shared.mjs"),
  );
  const importPath = path.relative(slidesDir, sharedPath).replaceAll("\\", "/");

  for (let index = 1; index <= SLIDE_COUNT; index += 1) {
    const padded = String(index).padStart(2, "0");
    const moduleSource = [
      `import { buildSlideByIndex } from "${importPath.startsWith(".") ? importPath : `./${importPath}`}";`,
      "",
      `export async function slide${padded}(presentation, ctx) {`,
      `  return buildSlideByIndex(presentation, ctx, ${index});`,
      "}",
      "",
    ].join("\n");
    await fs.writeFile(path.join(slidesDir, `slide-${padded}.mjs`), moduleSource, "utf8");
  }

  const manifest = {
    repoRoot,
    threadId,
    workspaceDir,
    slidesDir,
    previewDir,
    layoutDir,
    qaDir,
    outputDir,
    assetDir,
  };
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
