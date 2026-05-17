# npm-peer-solver

Research prototype for detecting and solving npm `peerDependencies` conflicts with the
[Z3](https://github.com/Z3Prover/z3) constraint solver.

The project was developed as part of a master's thesis on dependency conflicts in the npm
ecosystem. Its scope is intentionally narrow: it focuses on a controlled class of conflicts
involving `peerDependencies`, not on reimplementing the full npm installer.

## What the tool does

Given a local `package.json`, the solver:

1. fetches package metadata from the npm registry,
2. builds candidate version domains,
3. encodes the conflict as an SMT problem,
4. asks Z3 whether a satisfying assignment exists,
5. returns either a concrete version assignment or an `UNSAT` result.

The tool answers a solver question: whether a compatible configuration exists in the adopted
candidate space. This is different from reproducing the exact behavior of `npm install`.

## Usage

```bash
cd path/to/project
npx npm-peer-solver
```

## Scope and limitations

- The prototype focuses on conflicts involving `peerDependencies`.
- It does not aim to model the entire npm installation algorithm.
- It does not optimize among all possible satisfying solutions.
- Reported results depend on the candidate version domains made available to the solver.

## Main scripts

| Script                  | What it does                                           |
| ----------------------- | ------------------------------------------------------ |
| `npm run build`         | Compile `src/` to `dist/`                              |
| `npm run dev`           | Recompile `src/` on change                             |
| `npm run typecheck`     | Run TypeScript checks without emitting files           |
| `npm test`              | Run regression tests on fixture cases                  |
| `npm run test:unit`     | Run unit tests for pure helpers                        |
| `npm run generate`      | Generate test cases from real npm packages             |
| `npm run generate:1000` | Generate 1000 cases                                    |
| `npm run solve`         | Run the solver on generated cases                      |
| `npm run pipeline`      | Generate cases and solve them                          |
| `npm run verify`        | Check selected `UNSAT` results with real `npm install` |
| `npm run clean`         | Remove `dist/` and `cases/`                            |

## Repository layout

- `src/` - solver implementation and CLI
- `scripts/` - case generation, batch execution, verification helpers
- `tests/` - unit and regression tests
- `fixtures/` - hand-crafted SAT/UNSAT cases
- `thesis-work/` - thesis writing workspace and source materials

## Reproducibility

The repository also contains the thesis workspace under `thesis-work/`, including materials
used to prepare the manuscript and reproduce the reported experiments. Public-facing users can
focus on the solver code and scripts listed above.
