import * as semver from "semver";
import { NpmPackageMetadata } from "../types";

// Expand an exact version pin to a wide open range so the solver can search
// across all available alternatives — not just the one version that happens
// to be pinned in package.json. The target range ">=1.0.0" intentionally
// excludes 0.x (pre-stable) releases while covering every stable major.
export const expandLockedVersion = (range: string): string => {
  // Already flexible (^, ~, >, <, =) or a complex OR range — leave as-is.
  if (range.match(/^[~^><=]/) || range.includes("||")) {
    return range;
  }
  // Looks like a concrete version (e.g. "8.16.0") — open it up.
  const parsed = semver.parse(range);
  if (parsed) {
    return ">=1.0.0";
  }
  // Unrecognised format (e.g. "latest", "file:..") — pass through unchanged.
  return range;
};

// Wrapper around semver.satisfies that swallows exceptions from malformed
// range strings found in the npm registry (e.g. ">=1, <2" uses a comma
// which is not valid semver syntax). Returns false instead of throwing.
export const satisfiesRange = (version: string, range: string): boolean => {
  try {
    return semver.satisfies(version, range);
  } catch {
    console.warn(`  ⚠ Invalid semver comparison: ${version} vs ${range}`);
    return false;
  }
};

// Returns only versions that semver considers valid AND stable (no prerelease
// suffix like -alpha, -beta, -rc). Filters out malformed version strings that
// sometimes appear in the npm registry (e.g. "1.0.0.alpha", "LATEST").
export const stableVersions = (meta: NpmPackageMetadata): string[] =>
  Object.keys(meta.versions ?? {}).filter(
    (v) => semver.valid(v) && !semver.prerelease(v),
  );
