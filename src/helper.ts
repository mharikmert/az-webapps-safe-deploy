import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type DeployType = 'zip' | 'war' | 'jar' | 'ear' | 'static' | 'startup';
const VALID_TYPES: DeployType[] = ['zip', 'war', 'jar', 'ear', 'static', 'startup'];

// Exported for testing - allows mocking fs operations
export const fsUtils = {
    existsSync: (p: string) => fs.existsSync(p),
    isDirectory: (p: string) => fs.statSync(p).isDirectory()
};

/**
 * Infer deploy type from file extension.
 */
export function inferDeployType(filePath: string): DeployType {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    if (VALID_TYPES.includes(ext as DeployType)) {
        return ext as DeployType;
    }
    return 'zip';
}

/**
 * Zip a folder to a temporary location.
 */
export async function zipFolder(folderPath: string): Promise<string> {
    const tempDir = process.env.RUNNER_TEMP || os.tmpdir();
    const zipPath = path.join(tempDir, `deploy-${Date.now()}.zip`);

    core.info(`📁 Folder detected, zipping to ${zipPath}...`);
    await exec.exec('zip', ['-q', '-r', zipPath, '.'], { cwd: folderPath });

    return zipPath;
}

/**
 * Prepare a package for deployment.
 * - Folder: zips it and returns the zip path + type 'zip'
 * - File: returns path as-is + inferred type from extension
 */
export async function preparePackage(srcPath: string): Promise<{ path: string; type: DeployType }> {
    if (!fsUtils.existsSync(srcPath)) {
        throw new Error(`Package path does not exist: ${srcPath}`);
    }

    if (fsUtils.isDirectory(srcPath)) {
        const zipPath = await zipFolder(srcPath);
        return { path: zipPath, type: 'zip' };
    }

    return { path: srcPath, type: inferDeployType(srcPath) };
}

