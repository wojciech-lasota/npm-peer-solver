# npm-peer-solver

`npm-peer-solver` is a research prototype for detecting and solving npm
`peerDependencies` conflicts with the [Z3](https://github.com/Z3Prover/z3) constraint solver.

The project focuses on a narrow question: given a `package.json`, does there exist a
compatible assignment of package versions that satisfies the modeled `peerDependencies`
constraints? It is not intended to be a full reimplementation of the npm installer.

## What the tool does

For a given project, the prototype:

1. reads dependency declarations from `package.json`,
2. fetches package metadata from the npm registry,
3. builds candidate version domains,
4. encodes the problem as an SMT instance,
5. asks Z3 whether a satisfying assignment exists,
6. returns either a concrete version assignment or `UNSAT`.

This means the tool answers a solver question in an explicit candidate space. That is different
from reproducing the exact behavior of `npm install`.

## Scope

- The prototype is centered on conflicts involving `peerDependencies`.
- It works on candidate version domains built from registry metadata.
- It reports satisfiability in the adopted model.
- It does not aim to model the full npm installation procedure.
- It does not optimize over all possible satisfying solutions.

## Usage

```bash
npx npm-peer-solver
```

Run the command in a directory that contains a `package.json`.

## Main scripts

| Script | What it does |
|---|---|
| `npm run build` | Compile `src/` to `dist/` |
| `npm run dev` | Recompile `src/` on change |
| `npm run typecheck` | Run TypeScript checks without emitting files |
| `npm run generate` | Generate test cases from real npm packages |
| `npm run generate:100:min-deps:10` | Generate 100 cases with at least 10 dependencies |
| `npm run generate:1000` | Generate 1000 cases |
| `npm run solve` | Run the solver on generated cases |
| `npm run pipeline` | Generate cases and solve them |
| `npm run pipeline:100` | Generate 100 cases and solve them |
| `npm run verify` | Check selected `UNSAT` results with real `npm install` |
| `npm run clean` | Remove `dist/` and `cases/` |
| `npm run clean:dist` | Remove `dist/` only |
| `npm run clean:cases` | Remove `cases/` only |

## Repository layout

- `src/` - solver implementation and CLI
- `scripts/` - case generation, batch execution, and verification helpers
- `data/` - seed data used by the case generator
- `cases/` - generated cases
- `dist/` - compiled output

## Notes

This repository contains the prototype code and experimental scripts only. It is meant to
support reproducible experiments on npm `peerDependencies` conflicts, not to serve as a
production package manager.
