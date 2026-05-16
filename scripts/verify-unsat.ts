// Verifies UNSAT cases by running `npm install --package-lock-only`
// with versions expanded to flexible ranges (same logic as the solver).
//
// Usage:
//   tsx scripts/verify-unsat.ts
//   tsx scripts/verify-unsat.ts --filter angular
//   tsx scripts/verify-unsat.ts --cases cases
//   tsx scripts/verify-unsat.ts --json-out reports/verify.json --md-out reports/verify.md

import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { PackageJson } from "../src/types";
import { expandLockedVersion } from "../src/utils/semverUtils";
import { parseArgs } from "./utils/parseArgs";

const args = parseArgs(process.argv.slice(2));
const CASES_DIR = path.resolve(
  (args.get("cases") as string | undefined) ?? path.join(__dirname, "../cases"),
);
const FILTER = (args.get("filter") as string | undefined) ?? null;
const NAMES_RAW = args.get("names") as string | undefined;
const NAMES: Set<string> | null = NAMES_RAW
  ? new Set(NAMES_RAW.split(",").map((s) => s.trim()))
  : null;
const JSON_OUT = (args.get("json-out") as string | undefined) ?? null;
const MD_OUT = (args.get("md-out") as string | undefined) ?? null;

interface NpmInstallResult {
  code: number | null;
  conflict: boolean;
  output: string;
}

interface VerificationCaseSummary {
  name: string;
  outcome: "GENUINE_UNSAT" | "FALSE_UNSAT" | "ERROR";
  exitCode: number | null;
  note: string | null;
}

interface VerifyReport {
  generatedAt: string;
  casesDir: string;
  filter: string | null;
  names: string[] | null;
  total: number;
  counts: {
    genuineUnsat: number;
    falseUnsat: number;
    error: number;
  };
  cases: VerificationCaseSummary[];
}

const ensureParentDir = async (filePath: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
};

const writeJsonReport = async (filePath: string, report: VerifyReport): Promise<void> => {
  await ensureParentDir(filePath);
  await fs.writeFile(path.resolve(filePath), JSON.stringify(report, null, 2) + "\n", "utf-8");
};

const writeMarkdownReport = async (filePath: string, report: VerifyReport): Promise<void> => {
  const lines: string[] = [
    "# UNSAT Verification Report",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Cases dir: \`${report.casesDir}\``,
    `- Filter: ${report.filter ?? "none"}`,
    `- Explicit names: ${report.names ? report.names.join(", ") : "none"}`,
    `- Total cases: ${report.total}`,
    `- Genuine UNSAT: ${report.counts.genuineUnsat}`,
    `- False UNSAT: ${report.counts.falseUnsat}`,
    `- Errors: ${report.counts.error}`,
    "",
    "## Cases",
    "",
    "| Case | Outcome | Exit code | Note |",
    "|---|---|---:|---|",
  ];

  for (const item of report.cases) {
    const note = item.note ? item.note.replace(/\|/g, "\\|") : "";
    lines.push(`| ${item.name} | ${item.outcome} | ${item.exitCode ?? ""} | ${note} |`);
  }

  await ensureParentDir(filePath);
  await fs.writeFile(path.resolve(filePath), lines.join("\n") + "\n", "utf-8");
};

const expandDeps = (deps: Record<string, string> | undefined): Record<string, string> => {
  if (!deps) return {};
  return Object.fromEntries(
    Object.entries(deps).map(([k, v]) => [k, expandLockedVersion(v)]),
  );
};

const runNpmInstall = (pkgJson: PackageJson): Promise<NpmInstallResult> => {
  return fs.mkdtemp(path.join(os.tmpdir(), "peer-verify-")).then((tmpDir) => {
    const tmpPkg = path.join(tmpDir, "package.json");
    const expanded: PackageJson = {
      ...pkgJson,
      dependencies: expandDeps(pkgJson.dependencies),
      devDependencies: expandDeps(pkgJson.devDependencies),
    };

    return fs.writeFile(tmpPkg, JSON.stringify(expanded, null, 2)).then(
      () =>
        new Promise<NpmInstallResult>((resolve) => {
          const chunks: Buffer[] = [];
          const proc = spawn(
            "npm",
            ["install", "--package-lock-only", "--no-audit", "--no-fund"],
            { cwd: tmpDir },
          );
          proc.stdout.on("data", (d: Buffer) => chunks.push(d));
          proc.stderr.on("data", (d: Buffer) => chunks.push(d));
          proc.on("close", async (code) => {
            const output = Buffer.concat(chunks).toString();
            const conflict =
              output.includes("ERESOLVE") ||
              output.includes("peer dep conflict") ||
              output.includes("Conflicting peer dependency");
            await fs.rm(tmpDir, { recursive: true, force: true });
            resolve({ code, conflict, output });
          });
          proc.on("error", async (err) => {
            await fs.rm(tmpDir, { recursive: true, force: true });
            resolve({ code: 1, conflict: false, output: err.message });
          });
        }),
    );
  });
};

const main = async (): Promise<void> => {
  const entries = await fs.readdir(CASES_DIR, { withFileTypes: true });
  let cases = entries
    .filter((e) => e.isDirectory() && e.name.startsWith("case-"))
    .map((e) => e.name)
    .sort();

  if (FILTER) cases = cases.filter((n) => n.includes(FILTER));
  if (NAMES) cases = cases.filter((n) => NAMES.has(n));

  if (cases.length === 0) {
    console.error(`No cases found in ${CASES_DIR}`);
    process.exit(1);
  }

  console.log(`Verifying ${cases.length} cases via npm install (with expanded ranges)...\n`);

  const results: { genuine: string[]; falseUnsat: string[]; error: Array<{ name: string; output: string }> } = {
    genuine: [],
    falseUnsat: [],
    error: [],
  };
  const caseSummaries: VerificationCaseSummary[] = [];

  for (const name of cases) {
    const caseDir = path.join(CASES_DIR, name);
    const pkgJson = JSON.parse(
      await fs.readFile(path.join(caseDir, "package.json"), "utf-8"),
    ) as PackageJson;

    process.stdout.write(`  ${name.padEnd(55)}`);
    const { code, conflict, output } = await runNpmInstall(pkgJson);
    const note = output
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("npm warn"))
      .slice(0, 2)
      .join(" | ") || null;

    if (conflict) {
      results.genuine.push(name);
      caseSummaries.push({ name, outcome: "GENUINE_UNSAT", exitCode: code, note });
      process.stdout.write(`✗ genuine UNSAT\n`);
    } else if (code === 0) {
      results.falseUnsat.push(name);
      caseSummaries.push({ name, outcome: "FALSE_UNSAT", exitCode: code, note });
      process.stdout.write(`⚠ FALSE UNSAT — npm found a solution!\n`);
    } else {
      results.error.push({ name, output });
      caseSummaries.push({ name, outcome: "ERROR", exitCode: code, note });
      process.stdout.write(`? error (exit ${code})\n`);
    }
  }

  const total = cases.length;
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Results: ${results.genuine.length}/${total} genuine UNSAT  |  ${results.falseUnsat.length} false UNSAT  |  ${results.error.length} errors
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (results.falseUnsat.length > 0) {
    console.log("\n⚠ FALSE UNSAT (solver needs fixing):");
    results.falseUnsat.forEach((n) => console.log(`  ${n}`));
  }
  if (results.error.length > 0) {
    console.log("\nErrors:");
    results.error.forEach(({ name, output }) => {
      console.log(`  ${name}`);
      const relevant = output
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("npm warn"))
        .slice(0, 2)
        .join(" | ");
      console.log(`    ${relevant}`);
    });
  }

  if (JSON_OUT || MD_OUT) {
    const report: VerifyReport = {
      generatedAt: new Date().toISOString(),
      casesDir: CASES_DIR,
      filter: FILTER,
      names: NAMES ? Array.from(NAMES).sort() : null,
      total,
      counts: {
        genuineUnsat: results.genuine.length,
        falseUnsat: results.falseUnsat.length,
        error: results.error.length,
      },
      cases: caseSummaries,
    };

    if (JSON_OUT) {
      await writeJsonReport(JSON_OUT, report);
      console.log(`\nSaved JSON report to ${path.resolve(JSON_OUT)}`);
    }
    if (MD_OUT) {
      await writeMarkdownReport(MD_OUT, report);
      console.log(`Saved Markdown report to ${path.resolve(MD_OUT)}`);
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
