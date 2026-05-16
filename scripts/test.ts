// Fixture-based regression test.
// Runs solver on fixtures/ and asserts each result matches expected outcome
// (derived from directory name prefix: sat-* → SAT, unsat-* → UNSAT).
//
// Usage:
//   npm test
//   tsx scripts/test.ts

import * as fs from "fs/promises";
import * as path from "path";
import { runSolver } from "./utils/runSolver";

const ROOT = path.resolve(__dirname, "..");
const FIXTURES_DIR = path.join(ROOT, "fixtures");

const main = async (): Promise<void> => {
  const entries = await fs.readdir(FIXTURES_DIR, { withFileTypes: true });
  const fixtures = entries
    .filter((e) => e.isDirectory() && (e.name.startsWith("sat-") || e.name.startsWith("unsat-")))
    .map((e) => ({
      name: e.name,
      expected: e.name.startsWith("unsat-") ? "UNSAT" : "SAT",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (fixtures.length === 0) {
    console.error(`No fixtures found in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  console.log(`\nRunning ${fixtures.length} fixtures...\n`);

  const failed: Array<{ name: string; expected: string; got: string; output: string }> = [];

  for (const { name, expected } of fixtures) {
    process.stdout.write(`  ${name.padEnd(45)} expected: ${expected.padEnd(5)} → `);
    const { status, output } = await runSolver(path.join(FIXTURES_DIR, name));

    if (status === expected) {
      process.stdout.write(`✔ ${status}\n`);
    } else {
      process.stdout.write(`✗ got ${status}\n`);
      failed.push({ name, expected, got: status, output });
    }
  }

  console.log(`\n${"━".repeat(60)}`);

  if (failed.length > 0) {
    console.error(`FAIL — ${failed.length}/${fixtures.length} fixtures did not match:\n`);
    for (const { name, expected, got, output } of failed) {
      console.error(`  ${name}`);
      console.error(`    expected: ${expected}, got: ${got}`);
      const relevant = output
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("npm warn"))
        .slice(0, 3)
        .map((l) => `    ${l}`)
        .join("\n");
      if (relevant) console.error(relevant);
    }
    process.exit(1);
  }

  console.log(`PASS — ${fixtures.length}/${fixtures.length} fixtures matched`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
