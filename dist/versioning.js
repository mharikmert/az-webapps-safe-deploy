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
exports.getVersionParams = getVersionParams;
exports.computeVersion = computeVersion;
exports.createTag = createTag;
exports.createRelease = createRelease;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const semver_1 = require("semver");
/**
 * Determines version parameters based on mode
 */
function getVersionParams(mode, inputs) {
    if (mode === 'non-prod') {
        return {
            defaultBump: inputs.non_prod_default_bump || 'false',
            suffix: inputs.non_prod_suffix || '-rc',
        };
    }
    else {
        return {
            defaultBump: inputs.prod_default_bump || 'patch',
            suffix: '',
        };
    }
}
/**
 * Gets the latest version tag from the repository
 */
async function getLatestVersionTag(octokit, releaseBranches, preReleaseBranches) {
    try {
        const { owner, repo } = github.context.repo;
        const ref = github.context.ref;
        const branch = ref.replace('refs/heads/', '');
        // Get all tags
        const tags = await octokit.rest.repos.listTags({
            owner,
            repo,
            per_page: 100,
        });
        if (tags.data.length === 0) {
            return null;
        }
        // Filter and parse version tags
        const versionTags = [];
        for (const tag of tags.data) {
            const tagName = tag.name.startsWith('v') ? tag.name.substring(1) : tag.name;
            const version = (0, semver_1.parse)(tagName);
            if (version && (0, semver_1.valid)(version)) {
                versionTags.push(version);
            }
        }
        if (versionTags.length === 0) {
            return null;
        }
        // Sort and get latest
        versionTags.sort((a, b) => a.compare(b));
        const latest = versionTags[versionTags.length - 1];
        return latest.version;
    }
    catch (error) {
        core.warning(`Failed to get latest version tag: ${error}`);
        return null;
    }
}
/**
 * Calculates the next version based on commits and default bump
 */
async function calculateNextVersion(defaultBump, releaseBranches, preReleaseBranches) {
    const octokit = github.getOctokit(core.getInput('github_token', { required: true }));
    // Get latest version
    const latestVersion = await getLatestVersionTag(octokit, releaseBranches, preReleaseBranches);
    if (!latestVersion) {
        // No existing version, start with 0.1.0
        return '0.1.0';
    }
    // If defaultBump is 'false', don't bump (for non-prod dry-run)
    if (defaultBump === 'false') {
        return latestVersion;
    }
    // Parse and increment
    const currentVersion = (0, semver_1.parse)(latestVersion);
    if (!currentVersion) {
        throw new Error(`Invalid version format: ${latestVersion}`);
    }
    // Determine bump type from commits (simplified - in practice you'd analyze commit messages)
    let bumpType = defaultBump;
    if (!['patch', 'minor', 'major'].includes(defaultBump)) {
        // Try to determine from commit messages
        try {
            const { owner, repo } = github.context.repo;
            const commits = await octokit.rest.repos.listCommits({
                owner,
                repo,
                sha: github.context.sha,
                per_page: 10,
            });
            // Simple heuristic: look for breaking changes or features
            const commitMessages = commits.data.map(c => c.commit.message.toLowerCase());
            if (commitMessages.some(msg => msg.includes('breaking') || msg.includes('!:'))) {
                bumpType = 'major';
            }
            else if (commitMessages.some(msg => msg.includes('feat') || msg.includes('feature'))) {
                bumpType = 'minor';
            }
            else {
                bumpType = 'patch';
            }
        }
        catch (error) {
            core.warning(`Could not analyze commits, using default bump: ${error}`);
            bumpType = 'patch';
        }
    }
    const nextVersion = (0, semver_1.inc)(currentVersion, bumpType);
    if (!nextVersion) {
        throw new Error(`Failed to increment version ${latestVersion} with bump ${bumpType}`);
    }
    return nextVersion;
}
/**
 * Computes the next version (dry-run) and app version
 */
async function computeVersion(mode, inputs) {
    const params = getVersionParams(mode, inputs);
    const releaseBranches = inputs.release_branches.split(',').map(b => b.trim());
    const preReleaseBranches = inputs.pre_release_branches.split(',').map(b => b.trim());
    const nextVersion = await calculateNextVersion(params.defaultBump, releaseBranches, preReleaseBranches);
    const appVersion = `${nextVersion}${params.suffix}`;
    core.info(`Computed NEW_VERSION=${nextVersion}`);
    core.info(`Computed APP_VERSION=${appVersion}`);
    return {
        nextVersion,
        appVersion,
    };
}
/**
 * Creates and pushes a git tag
 */
async function createTag(version, githubToken) {
    const tagName = `v${version}`;
    const { owner, repo } = github.context.repo;
    const octokit = github.getOctokit(githubToken);
    try {
        // Check if tag already exists
        try {
            await octokit.rest.git.getRef({
                owner,
                repo,
                ref: `tags/${tagName}`,
            });
            core.info(`Tag ${tagName} already exists, skipping creation.`);
            return tagName;
        }
        catch (error) {
            if (error.status !== 404) {
                throw error;
            }
            // Tag doesn't exist, create it
        }
        // Get the current commit SHA
        const sha = github.context.sha;
        // Create the tag
        await octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/tags/${tagName}`,
            sha,
        });
        core.info(`Created tag ${tagName}`);
        return tagName;
    }
    catch (error) {
        core.error(`Failed to create tag: ${error}`);
        throw error;
    }
}
/**
 * Creates a GitHub release
 */
async function createRelease(tagName, githubToken, changelog) {
    const { owner, repo } = github.context.repo;
    const octokit = github.getOctokit(githubToken);
    try {
        await octokit.rest.repos.createRelease({
            owner,
            repo,
            tag_name: tagName,
            name: tagName,
            body: changelog || `Release ${tagName}`,
        });
        core.info(`Created GitHub release ${tagName}`);
    }
    catch (error) {
        core.error(`Failed to create release: ${error}`);
        throw error;
    }
}
//# sourceMappingURL=versioning.js.map