#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { PackageJson, Solution } from "./types";
import { fetchMultiplePackages } from "./npmMetadata";
import { buildDomains } from "./buildDomains";
import { solvePeerDependencies } from "./solver";
import { GREEN, RED, RESET } from "./utils/colors";

const printSolution = (solution: Solution[]): void => {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`${GREEN}Solution found!${RESET}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const sorted = [...solution].sort((a, b) => a.packageName.localeCompare(b.packageName));
  const maxNameLength = Math.max(...sorted.map((s) => s.packageName.length), "Package".length);

  console.log(`  ${"Package".padEnd(maxNameLength)}  Version`);
  console.log(`  ${"─".repeat(maxNameLength)}  ${"─".repeat(15)}`);
  for (const { packageName, version } of sorted) {
    console.log(`  ${packageName.padEnd(maxNameLength)}  ${version}`);
  }
};

const generateInstallCommand = (solution: Solution[]): string =>
  `npm install ${solution.map((s) => `${s.packageName}@${s.version}`).sort().join(" ")}`;

const main = async (): Promise<void> => {
  console.log("npm-peer-solver\n");

  const packageJsonPath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`${RED}Error: package.json not found in current directory${RESET}`);
    process.exit(1);
  }

  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch (error) {
    console.error(`${RED}Error: Failed to read or parse package.json${RESET}`);
    console.error(error);
    process.exit(1);
  }

  console.log(`Project: ${packageJson.name ?? "unknown"}\n`);

  const allDeps: Record<string, string> = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const packageNames = Object.keys(allDeps);
  if (packageNames.length === 0) {
    console.log("No dependencies found in package.json");
    process.exit(0);
  }
  console.log(`Found ${packageNames.length} dependencies\n`);

  const metadataMap = await fetchMultiplePackages(packageNames);
  if (metadataMap.size === 0) {
    console.error(`${RED}Error: Failed to fetch any package metadata${RESET}`);
    process.exit(1);
  }
  console.log(`\n${GREEN}✓ Successfully fetched ${metadataMap.size} package(s)${RESET}\n`);

  console.log("Building candidate version domains...");
  console.log("Note: Locked versions are automatically expanded to find compatible versions\n");
  const domains = buildDomains(allDeps, metadataMap);

  if (domains.length === 0) {
    console.error(`${RED}Error: No valid candidate versions found${RESET}`);
    process.exit(1);
  }
  console.log(`\n✓ Built domains for ${domains.length} package(s)`);

  const solution = await solvePeerDependencies(domains);

  if (!solution) {
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`${RED}UNSAT: No compatible set of versions found${RESET}`);
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\nThis means that there is no combination of package versions");
    console.log("that satisfies all peer dependency requirements.");
    console.log("\nPossible solutions:");
    console.log("  - Relax version constraints in package.json");
    console.log("  - Update packages that have conflicting peer dependencies");
    console.log("  - Remove packages with incompatible requirements");
    process.exit(1);
  }

  printSolution(solution);
  console.log("\nInstall command:\n");
  console.log(`  ${generateInstallCommand(solution)}\n`);
};

main().catch((error) => {
  console.error(`\n${RED}Fatal error:${RESET}`);
  console.error(error);
  process.exit(1);
});
