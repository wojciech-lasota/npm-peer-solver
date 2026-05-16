// The subset of package.json fields we read. The index signature allows
// arbitrary extra fields (type, private, scripts, etc.) without casting.
export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

// Shape of the full packument document returned by the npm registry
// (https://registry.npmjs.org/<package>). After fetch we immediately slim
// it down to only the fields below — see npmMetadata.ts slimMetadata().
export interface NpmPackageMetadata {
  name: string;
  versions: Record<string, NpmVersionMetadata>;
  "dist-tags": {
    latest: string;
    [tag: string]: string;
  };
}

// Per-version entry inside a packument. Only peerDependencies is relevant
// for solving; the rest is kept to satisfy the type but discarded by slimMetadata().
export interface NpmVersionMetadata {
  name: string;
  version: string;
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// A specific version of a package that the solver may select,
// together with its peer dependency constraints.
export interface CandidateVersion {
  packageName: string;
  version: string;
  peerDependencies: Record<string, string>;
}

// The search domain for one package: the range from package.json and the
// set of candidate versions the solver will choose from.
// requestedRange is the ORIGINAL value from package.json (possibly a locked
// exact version like "8.16.0"); candidates are built from the EXPANDED range.
export interface PackageDomain {
  packageName: string;
  requestedRange: string;
  candidates: CandidateVersion[];
}

// A single selected package@version in the final solution.
export interface Solution {
  packageName: string;
  version: string;
}
