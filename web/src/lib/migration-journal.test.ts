import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
};

test("migration journal timestamps increase with migration order", () => {
  const journal = JSON.parse(
    readFileSync(
      new URL("../../drizzle/meta/_journal.json", import.meta.url),
      "utf8",
    ),
  ) as { entries: JournalEntry[] };

  for (const [position, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, position, `migration index drift at ${entry.tag}`);
    assert.equal(
      existsSync(
        new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
      ),
      true,
      `missing SQL file for ${entry.tag}`,
    );
    if (position > 0) {
      assert.ok(
        entry.when > journal.entries[position - 1]!.when,
        `${entry.tag} must have a later timestamp than the prior migration`,
      );
    }
  }
});
