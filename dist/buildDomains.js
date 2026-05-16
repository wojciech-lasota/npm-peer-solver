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
exports.buildDomains = exports.buildCandidatesForPackage = exports.satisfiesRange = void 0;
const semver = __importStar(require("semver"));
const semverUtils_1 = require("./utils/semverUtils");
const debug_1 = require("./utils/debug");
var semverUtils_2 = require("./utils/semverUtils");
Object.defineProperty(exports, "satisfiesRange", { enumerable: true, get: function () { return semverUtils_2.satisfiesRange; } });
// 30 covers Angular's 23+ major versions plus diversity padding without
// making the Z3 problem too large (at-most-one constraints are O(n²)).
const MAX_CANDIDATES = 30;
// Minimum for single-major packages (e.g. ESLint plugins that release a new
// version for every host bump). Phase 1 would give only 1 candidate for them;
// phase 2 pads with versions that have different peer dep signatures.
const MIN_CANDIDATES = 8;
const buildCandidatesForPackage = (packageName, requestedRange, metadata) => {
    const allVersions = Object.keys(metadata.versions);
    // OR ranges (e.g. "^14 || ^15 || ^16") need to be split so each branch gets
    // a fair share of the candidate budget instead of one branch dominating.
    if (requestedRange.includes("||")) {
        const subRanges = requestedRange.split("||").map((r) => r.trim());
        const candidatesPerRange = Math.ceil(MAX_CANDIDATES / subRanges.length);
        const allCandidates = [];
        for (const subRange of subRanges) {
            const matching = allVersions
                .filter((version) => {
                try {
                    return semver.satisfies(version, subRange);
                }
                catch {
                    // npm registry contains non-standard version strings (e.g. "3.0.0.alpha")
                    // that semver rejects — skip them silently.
                    return false;
                }
            })
                .sort((a, b) => {
                try {
                    return semver.rcompare(a, b);
                }
                catch {
                    return 0;
                }
            });
            allCandidates.push(...matching.slice(0, candidatesPerRange));
        }
        return allCandidates.map((version) => ({
            packageName,
            version,
            peerDependencies: metadata.versions[version].peerDependencies ?? {},
        }));
    }
    const matchingVersions = allVersions
        .filter((version) => {
        try {
            return semver.satisfies(version, requestedRange);
        }
        catch {
            return false;
        }
    })
        .sort((a, b) => {
        try {
            return semver.rcompare(a, b);
        }
        catch {
            return 0;
        }
    });
    // Phase 1: one newest version per major — ALL majors, no cap.
    // This ensures every major is represented so that plugins requiring old
    // majors (e.g. "^2.4.0", "^6.0.1") have a candidate to match against.
    const byMajor = new Map();
    for (const v of matchingVersions) {
        const major = semver.major(v);
        if (!byMajor.has(major))
            byMajor.set(major, v); // matchingVersions is desc → first = newest
    }
    const phase1 = new Set(byMajor.values());
    // Phase 1b: fill remaining slots up to MAX_CANDIDATES newest-first.
    // Restores "multiple recent versions per major" behavior for recent majors
    // without sacrificing the full-history coverage from phase 1.
    for (const v of matchingVersions) {
        if (phase1.size >= MAX_CANDIDATES)
            break;
        phase1.add(v);
    }
    // Phase 2: add versions with unique peer dep signatures up to MIN_CANDIDATES.
    // Needed for single-major packages that release a new version for every host
    // version bump (each version has a different peerDependencies entry). Without
    // this, phase 1 would give only 1 candidate and the solver might miss valid
    // combinations where a specific plugin version requires a specific host version.
    const seenPeerKey = new Set([...phase1].map((v) => {
        const pd = metadata.versions[v]?.peerDependencies ?? {};
        return JSON.stringify(Object.entries(pd).sort());
    }));
    const topVersions = [...phase1];
    for (const v of matchingVersions) {
        if (topVersions.length >= Math.max(MIN_CANDIDATES, phase1.size))
            break;
        if (phase1.has(v))
            continue;
        const pd = metadata.versions[v]?.peerDependencies ?? {};
        const key = JSON.stringify(Object.entries(pd).sort());
        if (!seenPeerKey.has(key)) {
            seenPeerKey.add(key);
            topVersions.push(v);
        }
    }
    topVersions.sort((a, b) => semver.rcompare(a, b));
    topVersions.splice(MAX_CANDIDATES);
    return topVersions.map((version) => ({
        packageName,
        version,
        peerDependencies: metadata.versions[version].peerDependencies ?? {},
    }));
};
exports.buildCandidatesForPackage = buildCandidatesForPackage;
const buildDomains = (dependencies, metadataMap) => {
    const domains = [];
    for (const [packageName, requestedRange] of Object.entries(dependencies)) {
        const metadata = metadataMap.get(packageName);
        if (!metadata) {
            console.warn(`  WARN: Skipping ${packageName}: metadata not available`);
            continue;
        }
        // Exact versions like "8.16.0" are expanded to ">=1.0.0" so the solver can
        // explore alternatives across all majors. The original requestedRange is
        // preserved in the domain for display purposes only.
        const expandedRange = (0, semverUtils_1.expandLockedVersion)(requestedRange);
        const wasExpanded = expandedRange !== requestedRange;
        const candidates = (0, exports.buildCandidatesForPackage)(packageName, expandedRange, metadata);
        if (candidates.length === 0) {
            console.warn(`  WARN: No versions of ${packageName} match range ${requestedRange}`);
            continue;
        }
        domains.push({ packageName, requestedRange, candidates });
        if (wasExpanded) {
            console.log(`  ${packageName}: ${candidates.length} candidate(s) (expanded ${requestedRange} → ${expandedRange})`);
        }
        else {
            console.log(`  ${packageName}: ${candidates.length} candidate(s) for range ${requestedRange}`);
        }
    }
    (0, debug_1.writeDebugFile)("buildCandidatesForPackage.JSON", domains);
    return domains;
};
exports.buildDomains = buildDomains;
//# sourceMappingURL=buildDomains.js.map