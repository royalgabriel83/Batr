// Fails if a stylesheet in apps/web contains a raw color value.
// Colors come only from the generated tokens.css (code-standards.md).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/web/", import.meta.url));
const skipDirs = new Set(["node_modules", ".next", "playwright-report", "test-results", "storybook-static"]);
const allowed = new Set(["app/tokens.css"]);
const rawColor = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?|oklch|lab|lch)\(/i;

function* cssFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) yield* cssFiles(join(dir, entry.name));
    } else if (entry.name.endsWith(".css")) {
      yield join(dir, entry.name);
    }
  }
}

const problems = [];
for (const file of cssFiles(root)) {
  const name = relative(root, file).replaceAll("\\", "/");
  if (allowed.has(name)) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (rawColor.test(line)) problems.push(`apps/web/${name}:${index + 1}: raw color value; use a token`);
    });
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("CSS token check passed.");
