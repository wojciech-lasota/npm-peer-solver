"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchMultiplePackages = exports.fetchPackageMetadata = void 0;
const colors_1 = require("./utils/colors");
const debug_1 = require("./utils/debug");
const NPM_REGISTRY = "https://registry.npmjs.org";
// The raw npm registry response for a single package can be very large
// (e.g. react: ~8 MB, angular/core: ~15 MB) because each version entry
// includes dist hashes, scripts, readme, keywords, etc. We only need
// the version strings and their peerDependencies, so we discard everything
// else immediately after parsing — before storing in the Map.
const slimMetadata = (meta) => ({
    name: meta.name,
    "dist-tags": meta["dist-tags"],
    versions: Object.fromEntries(Object.entries(meta.versions).map(([v, vm]) => {
        const slim = { name: vm.name, version: vm.version };
        if (vm.peerDependencies)
            slim.peerDependencies = vm.peerDependencies;
        return [v, slim];
    })),
});
const fetchPackageMetadata = async (packageName) => {
    // The npm registry accepts unencoded scoped names like @scope/pkg in the URL.
    const url = `${NPM_REGISTRY}/${packageName}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`Package "${packageName}" not found in npm registry`);
            }
            throw new Error(`Failed to fetch package "${packageName}": ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return slimMetadata(data);
    }
    catch (error) {
        if (error instanceof Error)
            throw error;
        throw new Error(`Failed to fetch package "${packageName}": ${error}`);
    }
};
exports.fetchPackageMetadata = fetchPackageMetadata;
const fetchMultiplePackages = async (packageNames) => {
    const results = new Map();
    console.log(`Fetching metadata for ${packageNames.length} packages...`);
    // Batch size 10: high enough to saturate a typical connection, low enough
    // not to trigger npm registry rate limiting (429 responses).
    const batchSize = 10;
    for (let i = 0; i < packageNames.length; i += batchSize) {
        const batch = packageNames.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (name) => {
            try {
                const metadata = await (0, exports.fetchPackageMetadata)(name);
                return { name, metadata };
            }
            catch (error) {
                console.error(`  ${colors_1.RED}✗ Failed to fetch ${name}: ${error}${colors_1.RESET}`);
                return { name, metadata: null };
            }
        }));
        for (const { name, metadata } of batchResults) {
            if (metadata) {
                results.set(name, metadata);
                console.log(`  ${colors_1.GREEN}✓ Fetched ${name}${colors_1.RESET}`);
            }
        }
    }
    (0, debug_1.writeDebugFile)("fetchMultiplePackages.JSON", Object.fromEntries(results));
    return results;
};
exports.fetchMultiplePackages = fetchMultiplePackages;
//# sourceMappingURL=npmMetadata.js.map