import { spawn } from "child_process";
import * as path from "path";

export type SolverStatus = "SAT" | "UNSAT" | "ERROR";

export interface SolverResult {
  status: SolverStatus;
  output: string;
  code: number | null;
}

const DEFAULT_SOLVER = path.resolve(__dirname, "../../dist/cli.js");

export const runSolver = (caseDir: string, solverPath = DEFAULT_SOLVER): Promise<SolverResult> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const proc = spawn("node", [solverPath], {
      cwd: caseDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => chunks.push(d));
    proc.on("close", (code) => {
      const output = Buffer.concat(chunks).toString();
      let status: SolverStatus;
      if (output.includes("Solution found")) status = "SAT";
      else if (output.includes("UNSAT")) status = "UNSAT";
      else status = "ERROR";
      resolve({ status, output, code });
    });
    proc.on("error", (err) =>
      resolve({ status: "ERROR", output: err.message, code: 1 }),
    );
  });
