// tsx scripts/generate-cases.ts [--count 50] [--min-deps 3] [--cases cases]
//   [--summary-out reports/ch08/generate-summary.json]

import * as fs from "fs/promises";
import * as path from "path";
import * as semver from "semver";
import { NpmPackageMetadata } from "../src/types";
import { fetchPackageMetadata } from "../src/npmMetadata";
import { stableVersions } from "../src/utils/semverUtils";
import { parseArgs } from "./utils/parseArgs";

type Seeds = Record<string, string[]>;

interface PluginPeerData {
  version: string;
  range: string;
}

interface CaseSpec {
  name: string;
  dependencies: Record<string, string>;
}

const args = parseArgs(process.argv.slice(2));
const OUT_DIR = path.resolve(
  (args.get("cases") as string | undefined) ?? path.join(__dirname, "../cases"),
);
const COUNT = parseInt((args.get("count") as string | undefined) ?? "50", 10);
const MIN_DEPS = parseInt((args.get("min-deps") as string | undefined) ?? "3", 10);
const SUMMARY_OUT = (args.get("summary-out") as string | undefined) ?? null;

const safeName = (name: string): string =>
  name.replace(/\//g, "-").replace(/@/g, "");

interface GenerationSummary {
  generatedAt: string;
  casesDir: string;
  requestedCount: number;
  generatedCount: number;
  minDeps: number;
  existingCaseCountBefore: number;
  existingMaxIndexBefore: number;
  firstGeneratedIndex: number;
  lastGeneratedIndex: number;
  classDistribution: Record<string, number>;
  generatedCases: string[];
}

const extractCaseIndex = (name: string): number | null => {
  const match = /^case-(\d+)-/.exec(name);
  return match ? parseInt(match[1], 10) : null;
};

const caseClassFromName = (name: string): string => {
  const parts = name.split("-");
  return parts.slice(2).join("-");
};

const writeSummary = async (summaryPath: string, summary: GenerationSummary): Promise<void> => {
  const abs = path.resolve(summaryPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(summary, null, 2) + "\n", "utf-8");
};

const readSeeds = async (): Promise<Seeds> => {
  const raw = await fs.readFile(path.join(__dirname, "../data/seeds.json"), "utf-8");
  return JSON.parse(raw) as Seeds;
};

const getPkgMeta = async (name: string): Promise<NpmPackageMetadata | null> => {
  try {
    return await fetchPackageMetadata(name);
  } catch {
    return null;
  }
};

const pluginPeerRangesForHost = (meta: NpmPackageMetadata, hostName: string): PluginPeerData[] => {
  const result: PluginPeerData[] = [];
  for (const v of stableVersions(meta)) {
    const pd = meta.versions[v]?.peerDependencies ?? {};
    const r = pd[hostName];
    if (typeof r === "string" && r.trim()) {
      try {
        new semver.Range(r.trim());
        result.push({ version: v, range: r.trim() });
      } catch {
        console.warn(`Invalid range ignored: ${r.trim()} for ${hostName}`);
      }
    }
  }
  return result;
};

const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const findDisjointPluginPair = (
  pluginAData: PluginPeerData[],
  pluginBData: PluginPeerData[],
): { a: PluginPeerData; b: PluginPeerData } | null => {
  for (const a of pluginAData) {
    for (const b of pluginBData) {
      if (!semver.intersects(a.range, b.range, { includePrerelease: false })) {
        return { a, b };
      }
    }
  }
  return null;
};

const findHostVsPluginConflict = (
  hostVersions: string[],
  pluginData: PluginPeerData[],
): { hostV: string; p: PluginPeerData } | null => {
  for (const hostV of hostVersions) {
    for (const p of pluginData) {
      if (!semver.satisfies(hostV, p.range, { includePrerelease: false })) {
        return { hostV, p };
      }
    }
  }
  return null;
};

const writeCase = (dir: string, spec: CaseSpec): Promise<void> => {
  const pkg = {
    name: spec.name,
    version: "0.0.0",
    private: true,
    license: "UNLICENSED",
    type: "module",
    dependencies: spec.dependencies,
  };
  return fs.writeFile(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
};

const main = async (): Promise<void> => {
  const seeds = await readSeeds();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const existingEntries = await fs.readdir(OUT_DIR, { withFileTypes: true });
  const existingCaseNames = existingEntries
    .filter((e) => e.isDirectory() && e.name.startsWith("case-"))
    .map((e) => e.name);
  const existingIndices = existingCaseNames
    .map(extractCaseIndex)
    .filter((n): n is number => n !== null);
  const existingMaxIndexBefore = existingIndices.length > 0 ? Math.max(...existingIndices) : 0;
  let nextIndex = existingMaxIndexBefore + 1;

  const hostNames = Object.keys(seeds);
  const hostMeta: Record<string, NpmPackageMetadata> = {};
  const hostStable: Record<string, string[]> = {};
  const pluginMeta: Record<string, NpmPackageMetadata | null> = {};
  const generatedCaseNames: string[] = [];
  const classDistribution: Record<string, number> = {};

  console.log(`Preloading metadata for ${hostNames.length} hosts...`);
  for (const host of hostNames) {
    process.stdout.write(`  → ${host}... `);
    const meta = await getPkgMeta(host);
    if (!meta) {
      process.stdout.write(`SKIP (fetch failed)\n`);
      continue;
    }
    hostMeta[host] = meta;
    hostStable[host] = stableVersions(meta).slice(-200);
    process.stdout.write(`OK (${hostStable[host].length} stable versions)\n`);
  }
  console.log();

  const getPluginData = async (name: string): Promise<NpmPackageMetadata | null> => {
    if (!(name in pluginMeta)) {
      pluginMeta[name] = await getPkgMeta(name);
    }
    return pluginMeta[name] ?? null;
  };

  const prefetchPlugins = async (names: string[], concurrency = 10): Promise<void> => {
    const toFetch = names.filter((n) => !(n in pluginMeta));
    if (toFetch.length === 0) return;
    process.stdout.write(`  fetching ${toFetch.length} new plugins in parallel...\n`);
    let done = 0;
    for (let i = 0; i < toFetch.length; i += concurrency) {
      const batch = toFetch.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (name) => {
          pluginMeta[name] = await getPkgMeta(name);
          process.stdout.write(`  ${++done}/${toFetch.length}\r`);
        }),
      );
    }
    process.stdout.write(`\n`);
  };

  let made = 0;
  let attempt = 0;
  const availableHosts = hostNames.filter((h) => hostMeta[h]);

  while (made < COUNT && attempt < COUNT * 20) {
    attempt++;
    if (attempt % 10 === 0) {
      process.stdout.write(`  [${made}/${COUNT} generated, attempt ${attempt}/${COUNT * 20}]\n`);
    }

    const host = pickRandom(availableHosts);
    const plugins = (seeds[host] ?? []).slice();
    if (plugins.length < 1) continue;

    const pluginPeerDatas: Record<string, PluginPeerData[]> = {};
    await prefetchPlugins(plugins);
    for (const p of plugins) {
      const meta = await getPluginData(p);
      if (!meta) continue;
      const data = pluginPeerRangesForHost(meta, host);
      if (data.length) pluginPeerDatas[p] = data;
    }

    const available = Object.keys(pluginPeerDatas);
    if (available.length < 1) continue;

    let caseSpec: CaseSpec | null = null;

    if (available.length >= 2) {
      const aName = pickRandom(available);
      const bCandidates = available.filter((x) => x !== aName);
      const bName = bCandidates.length > 0 ? pickRandom(bCandidates) : aName;
      const disjoint = findDisjointPluginPair(pluginPeerDatas[aName], pluginPeerDatas[bName]);
      if (disjoint && aName !== bName) {
        const hostV = pickRandom(hostStable[host]);
        caseSpec = {
          name: `case-${String(nextIndex).padStart(3, "0")}-${safeName(host)}-plugins-disjoint`,
          dependencies: {
            [host]: hostV,
            [aName]: disjoint.a.version,
            [bName]: disjoint.b.version,
          },
        };
      }
    }

    if (!caseSpec) {
      const pName = pickRandom(available);
      const hvp = findHostVsPluginConflict(hostStable[host], pluginPeerDatas[pName]);
      if (hvp) {
        caseSpec = {
          name: `case-${String(nextIndex).padStart(3, "0")}-${safeName(host)}-host-mismatch`,
          dependencies: {
            [host]: hvp.hostV,
            [pName]: hvp.p.version,
          },
        };
      }
    }

    if (!caseSpec) continue;

    const extraPlugins = available.filter((p) => !(p in caseSpec!.dependencies));
    while (Object.keys(caseSpec.dependencies).length < MIN_DEPS && extraPlugins.length) {
      const idx = Math.floor(Math.random() * extraPlugins.length);
      const extra = extraPlugins.splice(idx, 1)[0];
      const meta = await getPluginData(extra);
      if (!meta) continue;
      const versions = stableVersions(meta);
      if (versions.length) {
        caseSpec.dependencies[extra] = pickRandom(versions);
      }
    }

    const dir = path.join(OUT_DIR, caseSpec.name);
    await fs.mkdir(dir, { recursive: true });
    await writeCase(dir, caseSpec);
    generatedCaseNames.push(caseSpec.name);
    const className = caseClassFromName(caseSpec.name);
    classDistribution[className] = (classDistribution[className] ?? 0) + 1;
    made++;
    nextIndex++;
    process.stdout.write(`✔ generated ${caseSpec.name}\n`);
  }

  console.log(`\nDone. Generated ${made} cases in ${OUT_DIR}`);
  if (generatedCaseNames.length > 0) {
    console.log("\nClass distribution:");
    for (const [className, count] of Object.entries(classDistribution).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      console.log(`  ${className}: ${count}`);
    }
  }
  if (made < COUNT) {
    console.warn("(Generated fewer cases than requested. Try increasing seeds or COUNT, or run again.)");
  }
  if (SUMMARY_OUT) {
    await writeSummary(SUMMARY_OUT, {
      generatedAt: new Date().toISOString(),
      casesDir: OUT_DIR,
      requestedCount: COUNT,
      generatedCount: made,
      minDeps: MIN_DEPS,
      existingCaseCountBefore: existingCaseNames.length,
      existingMaxIndexBefore,
      firstGeneratedIndex: generatedCaseNames.length > 0 ? extractCaseIndex(generatedCaseNames[0]) ?? nextIndex : nextIndex,
      lastGeneratedIndex:
        generatedCaseNames.length > 0
          ? extractCaseIndex(generatedCaseNames[generatedCaseNames.length - 1]) ?? (nextIndex - 1)
          : nextIndex - 1,
      classDistribution,
      generatedCases: generatedCaseNames,
    });
    console.log(`Saved generation summary to ${path.resolve(SUMMARY_OUT)}`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
