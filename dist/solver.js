"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.solvePeerDependencies = void 0;
const z3_solver_1 = require("z3-solver");
const semverUtils_1 = require("./utils/semverUtils");
const colors_1 = require("./utils/colors");
const solvePeerDependencies = async (domains) => {
    console.log("\nBuilding SMT model...");
    const { Context } = await (0, z3_solver_1.init)();
    const ctx = Context("main");
    const solver = new ctx.Solver();
    // One boolean variable per package@version combination.
    // A variable being true means "this version is selected".
    const variables = new Map();
    for (const domain of domains) {
        for (const candidate of domain.candidates) {
            const varName = `${candidate.packageName}@${candidate.version}`;
            variables.set(varName, ctx.Bool.const(varName));
        }
    }
    console.log(`  Created ${variables.size} boolean variables`);
    // Throws on missing variable rather than silently returning undefined —
    // missing variables indicate a logic bug that should surface immediately.
    const getVar = (varName) => {
        const v = variables.get(varName);
        if (v === undefined)
            throw new Error(`Bug: missing Z3 variable for ${varName}`);
        return v;
    };
    // Constraint 1: exactly one version selected per package.
    // Encoded as: (at-least-one OR) AND (for each pair: NOT(a AND b)).
    // Naive O(n²) pairwise at-most-one is fine here because MAX_CANDIDATES=30,
    // so at most 30*29/2 = 435 clauses per package.
    for (const domain of domains) {
        const candidateVars = domain.candidates.map((c) => getVar(`${c.packageName}@${c.version}`));
        if (candidateVars.length === 0) {
            console.error(`  ${colors_1.RED}✗ No candidates for ${domain.packageName}${colors_1.RESET}`);
            return null;
        }
        if (candidateVars.length === 1) {
            // Only one candidate — it must be chosen.
            solver.add(candidateVars[0]);
        }
        else {
            solver.add(ctx.Or(...candidateVars));
            for (let i = 0; i < candidateVars.length; i++) {
                for (let j = i + 1; j < candidateVars.length; j++) {
                    solver.add(ctx.Not(ctx.And(candidateVars[i], candidateVars[j])));
                }
            }
        }
    }
    console.log(`  Added "exactly one version" constraints for ${domains.length} packages`);
    // Constraint 2: peer dependency compatibility.
    // For each candidate that has a peer dependency on a package also in our domain:
    //   IF this candidate is selected THEN at least one compatible peer must be selected.
    // Peers not present in the domain are ignored — they're optional or installed
    // outside this package.json and not our responsibility to constrain.
    let peerConstraintCount = 0;
    for (const domain of domains) {
        for (const candidate of domain.candidates) {
            const candidateVar = variables.get(`${candidate.packageName}@${candidate.version}`);
            if (!candidateVar)
                continue;
            for (const [peerName, peerRange] of Object.entries(candidate.peerDependencies)) {
                const peerDomain = domains.find((d) => d.packageName === peerName);
                if (!peerDomain)
                    continue; // peer not in our dependency graph
                const compatiblePeerVars = peerDomain.candidates
                    .filter((pc) => (0, semverUtils_1.satisfiesRange)(pc.version, peerRange))
                    .map((pc) => variables.get(`${pc.packageName}@${pc.version}`))
                    .filter((v) => v !== undefined);
                if (compatiblePeerVars.length === 0) {
                    // No candidate of the peer satisfies this range — this version is
                    // impossible to select. Adding NOT early lets Z3 prune the search space
                    // rather than discovering the contradiction during solving.
                    console.log(`  WARN: ${candidate.packageName}@${candidate.version} requires ${peerName}${peerRange}, but no compatible version exists`);
                    solver.add(ctx.Not(candidateVar));
                }
                else if (compatiblePeerVars.length === 1) {
                    solver.add(ctx.Implies(candidateVar, compatiblePeerVars[0]));
                    peerConstraintCount++;
                }
                else {
                    solver.add(ctx.Implies(candidateVar, ctx.Or(...compatiblePeerVars)));
                    peerConstraintCount++;
                }
            }
        }
    }
    console.log(`  Added ${peerConstraintCount} peer dependency constraints`);
    console.log("\nSolving...");
    const result = await solver.check();
    if (result === "sat") {
        console.log(`  ${colors_1.GREEN}SAT - Solution found!${colors_1.RESET}\n`);
        const model = solver.model();
        const solution = [];
        for (const domain of domains) {
            for (const candidate of domain.candidates) {
                const varName = `${candidate.packageName}@${candidate.version}`;
                const boolVar = variables.get(varName);
                // The exactly-one constraint guarantees at most one candidate per domain
                // evaluates to true in the model, so we can break after the first match.
                if (boolVar && model.eval(boolVar).toString() === "true") {
                    solution.push({ packageName: candidate.packageName, version: candidate.version });
                    break;
                }
            }
        }
        return solution;
    }
    console.log(`  ${colors_1.RED}UNSAT - No solution found${colors_1.RESET}\n`);
    return null;
};
exports.solvePeerDependencies = solvePeerDependencies;
//# sourceMappingURL=solver.js.map