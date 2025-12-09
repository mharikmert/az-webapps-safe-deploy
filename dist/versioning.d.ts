export interface VersionParams {
    defaultBump: string;
    suffix: string;
}
export interface VersionResult {
    nextVersion: string;
    appVersion: string;
}
/**
 * Determines version parameters based on mode
 */
export declare function getVersionParams(mode: 'non-prod' | 'prod', inputs: {
    non_prod_default_bump: string;
    non_prod_suffix: string;
    prod_default_bump: string;
}): VersionParams;
/**
 * Computes the next version (dry-run) and app version
 */
export declare function computeVersion(mode: 'non-prod' | 'prod', inputs: {
    non_prod_default_bump: string;
    non_prod_suffix: string;
    prod_default_bump: string;
    release_branches: string;
    pre_release_branches: string;
}): Promise<VersionResult>;
/**
 * Creates and pushes a git tag
 */
export declare function createTag(version: string, githubToken: string): Promise<string>;
/**
 * Creates a GitHub release
 */
export declare function createRelease(tagName: string, githubToken: string, changelog?: string): Promise<void>;
//# sourceMappingURL=versioning.d.ts.map