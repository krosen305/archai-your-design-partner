import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Finding = {
  file: string;
  line: number;
  term: string;
  text: string;
};

const root = process.cwd();

const rootFiles = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs",
  "evals/README.md",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE",
];

const skippedPathParts = [
  ".git",
  "node_modules",
  "docs/archive",
  "docs/lint-warning-backlog.md",
  "CHANGELOG.md",
];

const staleTerms: Array<{ label: string; pattern: RegExp }> = [
  { label: "Dream to Draft", pattern: /\bDream to Draft\b/i },
  { label: "Bureaucracy Killer", pattern: /\bBureaucracy Killer\b/i },
  { label: "dream home", pattern: /\bdream home\b/i },
  { label: "drømmehus", pattern: /\bdrømmehus\b/i },
  { label: "Hus-DNA", pattern: /\bHus-DNA\b/i },
  { label: "inspirationsbilleder", pattern: /\binspirationsbilleder\b/i },
  { label: "BilledeAnalyse", pattern: /\bBilledeAnalyse\b/i },
  { label: "billede-analyse", pattern: /\bbillede-analyse\b/i },
  { label: "plantegning", pattern: /\bplantegning(er)?\b/i },
  { label: "BIM", pattern: /\bBIM\b/i },
  { label: "myndighedspakke", pattern: /\bmyndighedspakke(r)?\b/i },
  { label: "udbud", pattern: /\budbud\b/i },
  { label: "one-click permit", pattern: /\bone-click permit\b/i },
  { label: "Sandkassen", pattern: /\bSandkassen\b/i },
  { label: "Maskinrummet", pattern: /\bMaskinrummet\b/i },
];

const allowedContextMarkers = [
  "archive",
  "archived",
  "arkiv",
  "arkiveret",
  "current product direction is defined",
  "do not invest",
  "do not revive",
  "ikke aktiv",
  "ikke aktuel",
  "ikke en roadmap",
  "legacy",
  "later",
  "not active",
  "not current",
  "not currently",
  "not part of the current",
  "non-goals",
  "old strategy",
  "paused",
  "post-mvp",
  "senere",
  "senere scope",
  "stop list",
  "stop now",
  "historical",
];

function toPosix(path: string) {
  return path.replace(/\\/g, "/");
}

function shouldSkip(path: string) {
  const rel = toPosix(relative(root, path));
  return skippedPathParts.some((part) => rel === part || rel.startsWith(`${part}/`));
}

function collectMarkdownFiles(path: string, files: string[] = []) {
  if (!existsSync(path) || shouldSkip(path)) {
    return files;
  }

  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      collectMarkdownFiles(join(path, entry), files);
    }
    return files;
  }

  if (path.endsWith(".md") || path.endsWith(".mdx")) {
    files.push(path);
  }
  return files;
}

function hasAllowedContext(lines: string[], index: number) {
  const start = Math.max(0, index - 12);
  const end = Math.min(lines.length, index + 13);
  const context = lines.slice(start, end).join("\n").toLowerCase();
  return allowedContextMarkers.some((marker) => context.includes(marker));
}

const files = rootFiles.flatMap((file) => collectMarkdownFiles(join(root, file)));
const findings: Finding[] = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const term of staleTerms) {
      if (!term.pattern.test(line)) {
        continue;
      }

      if (hasAllowedContext(lines, index)) {
        continue;
      }

      findings.push({
        file: toPosix(relative(root, file)),
        line: index + 1,
        term: term.label,
        text: line.trim(),
      });
    }
  });
}

if (findings.length > 0) {
  console.error("Strategy lint failed. Old strategy language appears active:\n");
  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line} [${finding.term}] ${finding.text}`,
    );
  }
  console.error(
    "\nMark the context as legacy/paused/later/archive, move it to docs/archive, or rewrite it for the screening strategy.",
  );
  process.exit(1);
}

console.log(`Strategy lint passed (${files.length} markdown files checked).`);
