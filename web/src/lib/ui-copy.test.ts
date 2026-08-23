import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SOURCE_ROOT = join(process.cwd(), "src");
const UI_SOURCE_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    return UI_SOURCE_EXTENSIONS.has(extension) ? [path] : [];
  });
}

test("UI source contains no em dashes", () => {
  const offenders = sourceFiles(SOURCE_ROOT).filter((path) =>
    readFileSync(path, "utf8").includes("\u2014"),
  );

  assert.deepEqual(offenders, []);
});
