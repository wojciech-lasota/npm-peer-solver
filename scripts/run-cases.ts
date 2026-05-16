// tsx scripts/run-cases.ts [--cases cases] [--solver dist/cli.js] [--filter name-pattern]
//   [--json-out reports/solve.json] [--md-out reports/solve.md]

import * as fs from "fs/promises";
import * as path from "path";
import { parseArgs } from "./utils/parseArgs";
import { runSolver, SolverStatus } from "./utils/runSolver";

const args = parseArgs(process.argv.slice(2));
const CASES_DIR = path.resolve((args.get("cases") as string | undefined) ?? path.join(__dirname, "../cases"));
const SOLVER_PATH = (args.get("solver") as string | undefined) ?? undefined;
const FILTER = (args.get("filter") as string | undefined) ?? null;
const JSON_OUT = (args.get("json-out") as string | undefined) ?? null;
const MD_OUT = (args.get("md-out") as string | undefined) ?? null;

interface CaseRunSummary {
  name: string;
  status: SolverStatus;
  firstLine: string | null;
}

interface SolveReport {
  generatedAt: string;
  casesDir: string;
  solverPath: string;
  filter: string | null;
  total: number;
  counts: Record<SolverStatus, number>;
  cases: CaseRunSummary[];
}

const ensureParentDir = async (filePath: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
};

const writeJsonReport = async (filePath: string, report: SolveReport): Promise<void> => {
  await ensureParentDir(filePath);
  await fs.writeFile(path.resolve(filePath), JSON.stringify(report, null, 2) + "\n", "utf-8");
};

const writeMarkdownReport = async (filePath: string, report: SolveReport): Promise<void> => {
  const lines: string[] = [
    "# Solver Run Report",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Cases dir: \`${report.casesDir}\``,
    `- Solver path: \`${report.solverPath}\``,
    `- Filter: ${report.filter ?? "none"}`,
    `- Total cases: ${report.total}`,
    `- SAT: ${report.counts.SAT}`,
    `- UNSAT: ${report.counts.UNSAT}`,
    `- ERROR: ${report.counts.ERROR}`,
    "",
    "## Cases",
    "",
    "| Case | Status | Note |",
    "|---|---|---|",
  ];

  for (const item of report.cases) {
    const note = item.firstLine ? item.firstLine.replace(/\|/g, "\\|") : "";
    lines.push(`| ${item.name} | ${item.status} | ${note} |`);
  }

  await ensureParentDir(filePath);
  await fs.writeFile(path.resolve(filePath), lines.join("\n") + "\n", "utf-8");
};

const main = async (): Promise<void> => {
  const entries = await fs.readdir(CASES_DIR, { withFileTypes: true });
  let cases = entries
    .filter((e) => e.isDirectory() && e.name.startsWith("case-"))
    .map((e) => e.name)
    .sort();

  if (FILTER) cases = cases.filter((name) => name.includes(FILTER));

  if (cases.length === 0) {
    console.error(`No cases found in ${CASES_DIR}`);
    process.exit(1);
  }

  console.log(`Running ${cases.length} cases...\n`);

  const results: Record<SolverStatus, string[]> = { SAT: [], UNSAT: [], ERROR: [] };
  const caseSummaries: CaseRunSummary[] = [];

  for (const name of cases) {
    const caseDir = path.join(CASES_DIR, name);
    process.stdout.write(`  ${name.padEnd(55)}`);
    const { status, output } = await runSolver(caseDir, SOLVER_PATH);
    results[status].push(name);
    const firstLine = output.split("\n").find((l) => l.trim())?.trim() ?? null;
    caseSummaries.push({ name, status, firstLine });
    const icon = status === "SAT" ? "✔" : status === "UNSAT" ? "✗" : "!";
    process.stdout.write(`${icon} ${status}\n`);
    if (status === "ERROR") {
      process.stdout.write(`    ${(firstLine ?? output).trim()}\n`);
    }
  }

  const total = cases.length;
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Results: ${results.SAT.length}/${total} SAT  |  ${results.UNSAT.length} UNSAT  |  ${results.ERROR.length} errors
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (results.UNSAT.length > 0) {
    console.log("\nUNSAT cases:");
    results.UNSAT.forEach((n) => console.log(`  ${n}`));
  }
  if (results.ERROR.length > 0) {
    console.log("\nERROR cases:");
    results.ERROR.forEach((n) => console.log(`  ${n}`));
  }

  if (JSON_OUT || MD_OUT) {
    const report: SolveReport = {
      generatedAt: new Date().toISOString(),
      casesDir: CASES_DIR,
      solverPath: SOLVER_PATH ?? path.resolve(__dirname, "../dist/cli.js"),
      filter: FILTER,
      total,
      counts: {
        SAT: results.SAT.length,
        UNSAT: results.UNSAT.length,
        ERROR: results.ERROR.length,
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
