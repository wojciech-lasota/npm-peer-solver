// Verifies SAT cases by:
// 1. running the solver for a case,
// 2. extracting the concrete package@version assignment,
// 3. asking npm to install exactly that assignment with `--package-lock-only`.
//
// Usage:
//   tsx scripts/verify-sat.ts
//   tsx scripts/verify-sat.ts --filter angular
//   tsx scripts/verify-sat.ts --names case-001-foo,case-002-bar
//   tsx scripts/verify-sat.ts --json-out reports/verify-sat.json --md-out reports/verify-sat.md

import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { parseArgs } from "./utils/parseArgs";
import { runSolver } from "./utils/runSolver";

const args = parseArgs(process.argv.slice(2));
const CASES_DIR = path.resolve(
  (args.get("cases") as string | undefined) ?? path.join(__dirname, "../cases"),
);
const SOLVER_PATH = (args.get("solver") as string | undefined) ?? undefined;
const FILTER = (args.get("filter") as string | undefined) ?? null;
const NAMES_RAW = args.get("names") as string | undefined;
const NAMES: Set<string> | null = NAMES_RAW
  ? new Set(NAMES_RAW.split(",").map((s) => s.trim()))
  : null;
const SOLVE_REPORT = (args.get("solve-report") as string | undefined) ?? null;
const JSON_OUT = (args.get("json-out") as string | undefined) ?? null;
const MD_OUT = (args.get("md-out") as string | undefined) ?? null;

interface NpmInstallResult {
  code: number | null;
  conflict: boolean;
  output: string;
}

type SatVerificationOutcome =
  | "VERIFIED_SAT"
  | "FALSE_SAT"
  | "NON_SAT"
  | "ERROR";

interface VerificationCaseSummary {
  name: string;
  outcome: SatVerificationOutcome;
  solverStatus: "SAT" | "UNSAT" | "ERROR";
  exitCode: number | null;
  note: string | null;
}

interface VerifySatReport {
  generatedAt: string;
  casesDir: string;
  solverPath: string;
  filter: string | null;
  names: string[] | null;
  solveReport: string | null;
  total: number;
  counts: {
    verifiedSat: number;
    falseSat: number;
    nonSat: number;
    error: number;
  };
  cases: VerificationCaseSummary[];
}

const ensureParentDir = async (filePath: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
};

const writeJsonReport = async (filePath: string, report: VerifySatReport): Promise<void> => {
  await ensureParentDir(filePath);
  await fs.writeFile(path.resolve(filePath), JSON.stringify(report, null, 2) + "\n", "utf-8");
};

const writeMarkdownReport = async (filePath: string, report: VerifySatReport): Promise<void> => {
  const lines: string[] = [
    "# SAT Verification Report",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Cases dir: \`${report.casesDir}\``,
    `- Solver path: \`${report.solverPath}\``,
    `- Filter: ${report.filter ?? "none"}`,
    `- Explicit names: ${report.names ? report.names.join(", ") : "none"}`,
    `- Solve report: ${report.solveReport ? `\`${report.solveReport}\`` : "none"}`,
    `- Total cases: ${report.total}`,
    `- Verified SAT: ${report.counts.verifiedSat}`,
    `- False SAT: ${report.counts.falseSat}`,
    `- Non-SAT: ${report.counts.nonSat}`,
    `- Errors: ${report.counts.error}`,
    "",
    "## Cases",
    "",
    "| Case | Outcome | Solver status | Exit code | Note |",
    "|---|---|---|---:|---|",
  ];

  for (const item of report.cases) {
    const note = item.note ? item.note.replace(/\|/g, "\\|") : "";
    lines.push(
      `| ${item.name} | ${item.outcome} | ${item.solverStatus} | ${item.exitCode ?? ""} | ${note} |`,
    );
  }

  await ensureParentDir(filePath);
  await fs.writeFile(path.resolve(filePath), lines.join("\n") + "\n", "utf-8");
};

const extractInstallCommand = (output: string): string | null => {
  const lines = output.split("\n").map((line) => line.trim());
  const installLine = lines.find((line) => line.startsWith("npm install "));
  return installLine ?? null;
};

const extractInstallSpecs = (installCommand: string): string[] => {
  return installCommand
    .replace(/^npm install\s+/, "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const runNpmInstallForSolution = async (specs: string[]): Promise<NpmInstallResult> => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "peer-verify-sat-"));
  const tmpPkg = path.join(tmpDir, "package.json");
  const deps = Object.fromEntries(
    specs.map((spec) => {
      const atIndex = spec.lastIndexOf("@");
      if (atIndex <= 0) {
        throw new Error(`Invalid install spec: ${spec}`);
      }
      return [spec.slice(0, atIndex), spec.slice(atIndex + 1)];
    }),
  );

  await fs.writeFile(
    tmpPkg,
    JSON.stringify({ name: "peer-verify-sat", private: true, dependencies: deps }, null, 2),
  );

  return new Promise<NpmInstallResult>((resolve) => {
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
  });
};

const firstRelevantLine = (output: string): string | null =>
  output
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("npm warn")) ?? null;

const main = async (): Promise<void> => {
  const entries = await fs.readdir(CASES_DIR, { withFileTypes: true });
  let cases = entries
    .filter((e) => e.isDirectory() && e.name.startsWith("case-"))
    .map((e) => e.name)
    .sort();

  if (SOLVE_REPORT) {
    const solveReportPath = path.resolve(SOLVE_REPORT);
    const raw = await fs.readFile(solveReportPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      cases?: Array<{ name: string; status: string }>;
    };
    const satCases = new Set(
      (parsed.cases ?? [])
        .filter((item) => item.status === "SAT")
        .map((item) => item.name),
    );
    cases = cases.filter((name) => satCases.has(name));
  }

  if (FILTER) cases = cases.filter((n) => n.includes(FILTER));
  if (NAMES) cases = cases.filter((n) => NAMES.has(n));

  if (cases.length === 0) {
    console.error(`No cases found in ${CASES_DIR}`);
    process.exit(1);
  }

  console.log(`Verifying ${cases.length} cases via solver + npm install (exact SAT assignment)...\n`);

  const results: {
    verifiedSat: string[];
    falseSat: string[];
    nonSat: string[];
    error: Array<{ name: string; output: string }>;
  } = {
    verifiedSat: [],
    falseSat: [],
    nonSat: [],
    error: [],
  };
  const caseSummaries: VerificationCaseSummary[] = [];

  for (const name of cases) {
    const caseDir = path.join(CASES_DIR, name);
    process.stdout.write(`  ${name.padEnd(55)}`);

    const solverResult = await runSolver(caseDir, SOLVER_PATH);
    if (solverResult.status !== "SAT") {
      results.nonSat.push(name);
      caseSummaries.push({
        name,
        outcome: "NON_SAT",
        solverStatus: solverResult.status,
        exitCode: solverResult.code,
        note: firstRelevantLine(solverResult.output),
      });
      process.stdout.write(`↷ ${solverResult.status} (skipped)\n`);
      continue;
    }

    const installCommand = extractInstallCommand(solverResult.output);
    if (!installCommand) {
      results.error.push({ name, output: solverResult.output });
      caseSummaries.push({
        name,
        outcome: "ERROR",
        solverStatus: solverResult.status,
        exitCode: solverResult.code,
        note: "Install command not found in solver output",
      });
      process.stdout.write(`? error (missing install command)\n`);
      continue;
    }

    const specs = extractInstallSpecs(installCommand);
    const { code, conflict, output } = await runNpmInstallForSolution(specs);
    const note = firstRelevantLine(output);

    if (code === 0 && !conflict) {
      results.verifiedSat.push(name);
      caseSummaries.push({
        name,
        outcome: "VERIFIED_SAT",
        solverStatus: solverResult.status,
        exitCode: code,
        note,
      });
      process.stdout.write(`✓ verified SAT\n`);
    } else if (conflict) {
      results.falseSat.push(name);
      caseSummaries.push({
        name,
        outcome: "FALSE_SAT",
        solverStatus: solverResult.status,
        exitCode: code,
        note,
      });
      process.stdout.write(`⚠ FALSE SAT — npm reported a conflict\n`);
    } else {
      results.error.push({ name, output });
      caseSummaries.push({
        name,
        outcome: "ERROR",
        solverStatus: solverResult.status,
        exitCode: code,
        note,
      });
      process.stdout.write(`? error (exit ${code})\n`);
    }
  }

  const total = cases.length;
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Results: ${results.verifiedSat.length}/${total} verified SAT  |  ${results.falseSat.length} false SAT  |  ${results.nonSat.length} non-SAT  |  ${results.error.length} errors
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (results.falseSat.length > 0) {
    console.log("\n⚠ FALSE SAT (solver returned a non-installable assignment):");
    results.falseSat.forEach((n) => console.log(`  ${n}`));
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
    const report: VerifySatReport = {
      generatedAt: new Date().toISOString(),
      casesDir: CASES_DIR,
      solverPath: SOLVER_PATH ?? path.resolve(__dirname, "../dist/cli.js"),
      filter: FILTER,
      names: NAMES ? Array.from(NAMES).sort() : null,
      solveReport: SOLVE_REPORT ? path.resolve(SOLVE_REPORT) : null,
      total,
      counts: {
        verifiedSat: results.verifiedSat.length,
        falseSat: results.falseSat.length,
        nonSat: results.nonSat.length,
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
