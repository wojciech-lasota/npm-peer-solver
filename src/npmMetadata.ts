import { NpmPackageMetadata, NpmVersionMetadata } from "./types";
import { GREEN, RED, RESET } from "./utils/colors";
import { writeDebugFile } from "./utils/debug";

const NPM_REGISTRY = "https://registry.npmjs.org";

// The raw npm registry response for a single package can be very large
// (e.g. react: ~8 MB, angular/core: ~15 MB) because each version entry
// includes dist hashes, scripts, readme, keywords, etc. We only need
// the version strings and their peerDependencies, so we discard everything
// else immediately after parsing — before storing in the Map.
const slimMetadata = (meta: NpmPackageMetadata): NpmPackageMetadata => ({
  name: meta.name,
  "dist-tags": meta["dist-tags"],
  versions: Object.fromEntries(
    Object.entries(meta.versions).map(([v, vm]) => {
      const slim: NpmVersionMetadata = { name: vm.name, version: vm.version };
      if (vm.peerDependencies) slim.peerDependencies = vm.peerDependencies;
      return [v, slim];
    }),
  ),
});

export const fetchPackageMetadata = async (
  packageName: string,
): Promise<NpmPackageMetadata> => {
  // The npm registry accepts unencoded scoped names like @scope/pkg in the URL.
  const url = `${NPM_REGISTRY}/${packageName}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Package "${packageName}" not found in npm registry`);
      }
      throw new Error(
        `Failed to fetch package "${packageName}": ${response.status} ${response.statusText}`,
      );
    }
    const data = await response.json();
    return slimMetadata(data as NpmPackageMetadata);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Failed to fetch package "${packageName}": ${error}`);
  }
};

export const fetchMultiplePackages = async (
  packageNames: string[],
): Promise<Map<string, NpmPackageMetadata>> => {
  const results = new Map<string, NpmPackageMetadata>();
  console.log(`Fetching metadata for ${packageNames.length} packages...`);

  // Batch size 10: high enough to saturate a typical connection, low enough
  // not to trigger npm registry rate limiting (429 responses).
  const batchSize = 10;
  for (let i = 0; i < packageNames.length; i += batchSize) {
    const batch = packageNames.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (name) => {
        try {
          const metadata = await fetchPackageMetadata(name);
          return { name, metadata };
        } catch (error) {
          console.error(`  ${RED}✗ Failed to fetch ${name}: ${error}${RESET}`);
          return { name, metadata: null };
        }
      }),
    );

    for (const { name, metadata } of batchResults) {
      if (metadata) {
        results.set(name, metadata);
        console.log(`  ${GREEN}✓ Fetched ${name}${RESET}`);
      }
    }
  }

  writeDebugFile("fetchMultiplePackages.JSON", Object.fromEntries(results));
  return results;
};
