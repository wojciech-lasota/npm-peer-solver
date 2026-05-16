// Collect plugin candidates for a given host from the npm registry.
//
// Usage:
//   tsx scripts/collect-seeds.ts --host vite --queries "vite-plugin,@vitejs" [--limit 80]
//
// Outputs a JSON array of plugin names that declare peerDependencies[host]
// with a valid semver range in at least one stable version. Ready to paste
// into data/seeds.json as the value for the host key.

import * as semver from "semver";
import { parseArgs } from "./utils/parseArgs";

interface SearchObject {
  package: {
    name: string;
    version?: string;
    searchScore?: number;
  };
}

interface SearchResult {
  objects: SearchObject[];
  total: number;
}

interface NpmVersionEntry {
  peerDependencies?: Record<string, string>;
}

interface NpmMetadata {
  name: string;
  versions: Record<string, NpmVersionEntry>;
}

const args = parseArgs(process.argv.slice(2));
const HOST = args.get("host") as string | undefined;
const QUERIES_RAW = args.get("queries") as string | undefined;
const LIMIT = parseInt((args.get("limit") as string | undefined) ?? "80", 10);
const CONCURRENCY = 10;

if (!HOST || !QUERIES_RAW) {
  console.error("Usage: tsx scripts/collect-seeds.ts --host <name> --queries <q1,q2,...> [--limit 80]");
  process.exit(1);
}

const QUERIES = QUERIES_RAW.split(",").map((q) => q.trim()).filter(Boolean);

const fetchJson = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "npm-peer-solver-seed-collector/1.0" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const searchNpm = async (query: string, size = 250): Promise<SearchObject[]> => {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`;
  const result = await fetchJson<SearchResult>(url);
  return result?.objects ?? [];
};

const fetchMeta = async (name: string): Promise<NpmMetadata | null> => {
  return fetchJson<NpmMetadata>(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
};

const stableVersions = (meta: NpmMetadata): string[] =>
  Object.keys(meta.versions ?? {}).filter(
    (v) => semver.valid(v) && !semver.prerelease(v),
  );

const hasValidPeerRange = (meta: NpmMetadata, hostName: string): boolean => {
  for (const v of stableVersions(meta)) {
    const r = meta.versions[v]?.peerDependencies?.[hostName];
    if (typeof r === "string" && r.trim()) {
      try {
        new semver.Range(r.trim());
        return true;
      } catch {
        // invalid range, skip
      }
    }
  }
  return false;
};

const batchFetch = async (
  names: string[],
  onResult: (name: string, meta: NpmMetadata | null) => void,
): Promise<void> => {
  let done = 0;
  for (let i = 0; i < names.length; i += CONCURRENCY) {
    const batch = names.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (name) => {
        const meta = await fetchMeta(name);
        onResult(name, meta);
        process.stderr.write(`  ${++done}/${names.length} fetched\r`);
      }),
    );
  }
  process.stderr.write("\n");
};

const main = async (): Promise<void> => {
  process.stderr.write(`Host: ${HOST}\nQueries: ${QUERIES.join(", ")}\nLimit: ${LIMIT}\n\n`);

  // Step 1: collect candidate names from all search queries (deduplicated)
  const candidateSet = new Set<string>();
  for (const query of QUERIES) {
    process.stderr.write(`Searching: ${query}...\n`);
    const objects = await searchNpm(query);
    for (const obj of objects) {
      const name = obj.package.name;
      if (name && name !== HOST) candidateSet.add(name);
    }
    process.stderr.write(`  → ${objects.length} results (total unique so far: ${candidateSet.size})\n`);
  }

  const candidates = Array.from(candidateSet);
  process.stderr.write(`\nTotal candidates to verify: ${candidates.length}\n`);
  process.stderr.write(`Fetching metadata (batch=${CONCURRENCY})...\n`);

  // Step 2: fetch metadata and filter by peerDependencies
  const valid: string[] = [];
  await batchFetch(candidates, (name, meta) => {
    if (meta && hasValidPeerRange(meta, HOST!)) {
      valid.push(name);
    }
  });

  process.stderr.write(`\nValid plugins (declare peerDependencies.${HOST}): ${valid.length}\n`);

  // Step 3: sort alphabetically and take up to LIMIT
  const result = valid.sort((a, b) => a.localeCompare(b)).slice(0, LIMIT);

  process.stderr.write(`Output: ${result.length} plugins\n\n`);
  console.log(JSON.stringify(result, null, 2));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
