#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const npmMetadata_1 = require("./npmMetadata");
const buildDomains_1 = require("./buildDomains");
const solver_1 = require("./solver");
const colors_1 = require("./utils/colors");
const printSolution = (solution) => {
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`${colors_1.GREEN}Solution found!${colors_1.RESET}`);
    console.log("═══════════════════════════════════════════════════════════\n");
    const sorted = [...solution].sort((a, b) => a.packageName.localeCompare(b.packageName));
    const maxNameLength = Math.max(...sorted.map((s) => s.packageName.length), "Package".length);
    console.log(`  ${"Package".padEnd(maxNameLength)}  Version`);
    console.log(`  ${"─".repeat(maxNameLength)}  ${"─".repeat(15)}`);
    for (const { packageName, version } of sorted) {
        console.log(`  ${packageName.padEnd(maxNameLength)}  ${version}`);
    }
};
const generateInstallCommand = (solution) => `npm install ${solution.map((s) => `${s.packageName}@${s.version}`).sort().join(" ")}`;
const main = async () => {
    console.log("npm-peer-solver\n");
    const packageJsonPath = path.join(process.cwd(), "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        console.error(`${colors_1.RED}Error: package.json not found in current directory${colors_1.RESET}`);
        process.exit(1);
    }
    let packageJson;
    try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    }
    catch (error) {
        console.error(`${colors_1.RED}Error: Failed to read or parse package.json${colors_1.RESET}`);
        console.error(error);
        process.exit(1);
    }
    console.log(`Project: ${packageJson.name ?? "unknown"}\n`);
    const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
    };
    const packageNames = Object.keys(allDeps);
    if (packageNames.length === 0) {
        console.log("No dependencies found in package.json");
        process.exit(0);
    }
    console.log(`Found ${packageNames.length} dependencies\n`);
    const metadataMap = await (0, npmMetadata_1.fetchMultiplePackages)(packageNames);
    if (metadataMap.size === 0) {
        console.error(`${colors_1.RED}Error: Failed to fetch any package metadata${colors_1.RESET}`);
        process.exit(1);
    }
    console.log(`\n${colors_1.GREEN}✓ Successfully fetched ${metadataMap.size} package(s)${colors_1.RESET}\n`);
    console.log("Building candidate version domains...");
    console.log("Note: Locked versions are automatically expanded to find compatible versions\n");
    const domains = (0, buildDomains_1.buildDomains)(allDeps, metadataMap);
    if (domains.length === 0) {
        console.error(`${colors_1.RED}Error: No valid candidate versions found${colors_1.RESET}`);
        process.exit(1);
    }
    console.log(`\n✓ Built domains for ${domains.length} package(s)`);
    const solution = await (0, solver_1.solvePeerDependencies)(domains);
    if (!solution) {
        console.log("═══════════════════════════════════════════════════════════");
        console.log(`${colors_1.RED}UNSAT: No compatible set of versions found${colors_1.RESET}`);
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
    console.error(`\n${colors_1.RED}Fatal error:${colors_1.RESET}`);
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map