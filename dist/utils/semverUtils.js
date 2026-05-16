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
exports.stableVersions = exports.satisfiesRange = exports.expandLockedVersion = void 0;
const semver = __importStar(require("semver"));
// Expand an exact version pin to a wide open range so the solver can search
// across all available alternatives — not just the one version that happens
// to be pinned in package.json. The target range ">=1.0.0" intentionally
// excludes 0.x (pre-stable) releases while covering every stable major.
const expandLockedVersion = (range) => {
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
exports.expandLockedVersion = expandLockedVersion;
// Wrapper around semver.satisfies that swallows exceptions from malformed
// range strings found in the npm registry (e.g. ">=1, <2" uses a comma
// which is not valid semver syntax). Returns false instead of throwing.
const satisfiesRange = (version, range) => {
    try {
        return semver.satisfies(version, range);
    }
    catch {
        console.warn(`  ⚠ Invalid semver comparison: ${version} vs ${range}`);
        return false;
    }
};
exports.satisfiesRange = satisfiesRange;
// Returns only versions that semver considers valid AND stable (no prerelease
// suffix like -alpha, -beta, -rc). Filters out malformed version strings that
// sometimes appear in the npm registry (e.g. "1.0.0.alpha", "LATEST").
const stableVersions = (meta) => Object.keys(meta.versions ?? {}).filter((v) => semver.valid(v) && !semver.prerelease(v));
exports.stableVersions = stableVersions;
//# sourceMappingURL=semverUtils.js.map