import { NpmPackageMetadata, PackageDomain, CandidateVersion } from "./types";
export { satisfiesRange } from "./utils/semverUtils";
export declare const buildCandidatesForPackage: (packageName: string, requestedRange: string, metadata: NpmPackageMetadata) => CandidateVersion[];
export declare const buildDomains: (dependencies: Record<string, string>, metadataMap: Map<string, NpmPackageMetadata>) => PackageDomain[];
//# sourceMappingURL=buildDomains.d.ts.map