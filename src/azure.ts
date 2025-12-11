import * as exec from '@actions/exec';
import * as core from '@actions/core';
import { preparePackage } from './helper';

/**
 * Helper to run az commands cleanly and capture output/errors.
 */
async function az(args: string[]): Promise<string> {
    let output = '';
    let errorOutput = '';

    const options = {
        listeners: {
            stdout: (data: Buffer) => { output += data.toString(); },
            stderr: (data: Buffer) => { errorOutput += data.toString(); }
        },
        silent: true // Keep logs clean, we manually handle errors
    };

    try {
        await exec.exec('az', args, options);
        return output.trim();
    } catch (err) {
        // Throw the ACTUAL Azure error message, not just "Process failed"
        const cleanError = errorOutput.trim() || (err instanceof Error ? err.message : 'Unknown error');
        throw new Error(`Azure CLI failed: ${cleanError}`);
    }
}

/**
 * Helper to append --slot argument safely.
 */
function addSlotArg(args: string[], slot: string) {
    if (slot.toLowerCase() !== 'production') {
        args.push('--slot', slot);
    }
}

/**
 * Deploy a package to Azure App Service.
 * - Folder: auto-zips via helper
 * - File: infers type from extension (zip, war, jar, ear)
 */
export async function deployPackage(rg: string, app: string, slot: string, srcPath: string) {
    const pkg = await preparePackage(srcPath);

    core.info(`📦 Deploying ${pkg.type} from ${pkg.path} to ${app} (${slot})...`);

    const args = [
        'webapp', 'deploy',
        '--resource-group', rg,
        '--name', app,
        '--src-path', pkg.path,
        '--type', pkg.type,
        '--async', 'false'
    ];

    addSlotArg(args, slot);
    await az(args);
}

export async function deployContainer(rg: string, app: string, slot: string, image: string) {
    core.info(`🐳 Deploying container to ${image} on ${app} (${slot})...`);

    // 1. Update configuration
    const configArgs = [
        'webapp', 'config', 'container', 'set',
        '--resource-group', rg,
        '--name', app,
        '--docker-custom-image-name', image
    ];
    addSlotArg(configArgs, slot);
    await az(configArgs);
}

export async function swapSlots(rg: string, app: string, sourceSlot: string, targetSlot: string) {
    core.info(`🚀 Swapping ${sourceSlot} -> ${targetSlot}...`);

    const args = [
        'webapp', 'deployment', 'slot', 'swap',
        '--resource-group', rg,
        '--name', app,
        '--slot', sourceSlot,
        '--target-slot', targetSlot
    ];

    await az(args);
}

export async function setAppSettings(rg: string, app: string, slot: string, settings: Record<string, string>) {
    const pairs = Object.entries(settings).map(([k, v]) => `${k}=${v}`);

    if (pairs.length === 0) return;

    core.info(`⚙️ Applying ${pairs.length} app settings to ${slot}...`);

    const args = [
        'webapp', 'config', 'appsettings', 'set',
        '--resource-group', rg,
        '--name', app,
        '--settings', ...pairs
    ];

    addSlotArg(args, slot);
    await az(args);
}

/**
 * Resolves the fully qualified URL for a specific slot.
 */
export async function getSlotUrl(rg: string, app: string, slot: string): Promise<string> {
    const args = [
        'webapp', 'show',
        '--resource-group', rg,
        '--name', app,
        '--query', 'defaultHostName',
        '-o', 'tsv'
    ];

    addSlotArg(args, slot);

    const hostname = await az(args);
    if (!hostname) {
        throw new Error(`Could not resolve hostname for ${app} (slot: ${slot})`);
    }

    return `https://${hostname}`;
}