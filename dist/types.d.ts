export interface PackageJson {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    [key: string]: unknown;
}
export interface NpmPackageMetadata {
    name: string;
    versions: Record<string, NpmVersionMetadata>;
    "dist-tags": {
        latest: string;
        [tag: string]: string;
    };
}
export interface NpmVersionMetadata {
    name: string;
    version: string;
    peerDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}
export interface CandidateVersion {
    packageName: string;
    version: string;
    peerDependencies: Record<string, string>;
}
export interface PackageDomain {
    packageName: string;
    requestedRange: string;
    candidates: CandidateVersion[];
}
export interface Solution {
    packageName: string;
    version: string;
}
//# sourceMappingURL=types.d.ts.map