#!/usr/bin/env node
/**
 * Route rendering-mode snapshot.
 *
 * Whether a route is prerendered at build time or rendered per request is a
 * performance contract, and nothing in CI noticed when it changed. A page that
 * silently flips from static to dynamic is a latency regression; one that flips
 * the other way can serve stale data. This records the mode of every app route
 * and fails when it moves without the snapshot being updated deliberately.
 *
 *   node scripts/route-snapshot.mjs --write   # regenerate after an intended change
 *   node scripts/route-snapshot.mjs --check   # fail on any unrecorded change
 *
 * Requires a completed `next build`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_DIR = join(webRoot, ".next");
const SNAPSHOT = join(webRoot, "route-snapshot.txt");

function readManifest(name) {
  const path = join(NEXT_DIR, name);
  if (!existsSync(path)) {
    console.error(`Missing ${name}. Run \`npm run build\` first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildSnapshot() {
  const appRoutes = readManifest("app-path-routes-manifest.json");
  const prerender = readManifest("prerender-manifest.json");
  const staticRoutes = new Set(Object.keys(prerender.routes ?? {}));

  const rows = [...new Set(Object.values(appRoutes))]
    .filter((route) => typeof route === "string")
    .sort()
    .map((route) => `${staticRoutes.has(route) ? "static " : "dynamic"}  ${route}`);

  return [
    "# Rendering mode per app route. Regenerate with:",
    "#   npm run build && node scripts/route-snapshot.mjs --write",
    "# A change here is a performance contract change — make sure it is intended.",
    ...rows,
    "",
  ].join("\n");
}

const snapshot = buildSnapshot();

if (process.argv.includes("--write")) {
  writeFileSync(SNAPSHOT, snapshot);
  const count = snapshot.split("\n").filter((l) => l && !l.startsWith("#")).length;
  console.log(`Wrote route-snapshot.txt (${count} routes).`);
  process.exit(0);
}

if (!existsSync(SNAPSHOT)) {
  console.error("No route-snapshot.txt. Create it with --write.");
  process.exit(1);
}

const committed = readFileSync(SNAPSHOT, "utf8");
if (committed === snapshot) {
  console.log("Route rendering modes unchanged.");
  process.exit(0);
}

const before = committed.split("\n");
const after = snapshot.split("\n");
const beforeSet = new Set(before);
const afterSet = new Set(after);

console.error("Route rendering modes changed:\n");
for (const line of before) {
  if (line && !line.startsWith("#") && !afterSet.has(line)) console.error(`  - ${line}`);
}
for (const line of after) {
  if (line && !line.startsWith("#") && !beforeSet.has(line)) console.error(`  + ${line}`);
}
console.error(
  "\nIf this is intended, run `node scripts/route-snapshot.mjs --write` and commit the result.",
);
process.exit(1);
