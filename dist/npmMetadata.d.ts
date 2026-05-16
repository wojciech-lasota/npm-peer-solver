import { NpmPackageMetadata } from "./types";
export declare const fetchPackageMetadata: (packageName: string) => Promise<NpmPackageMetadata>;
export declare const fetchMultiplePackages: (packageNames: string[]) => Promise<Map<string, NpmPackageMetadata>>;
//# sourceMappingURL=npmMetadata.d.ts.map