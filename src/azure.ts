import * as exec from '@actions/exec';

// Helper to run az commands cleanly
async function az(args: string[]): Promise<string> {
    let output = '';
    const options = {
        listeners: {
            stdout: (data: Buffer) => { output += data.toString(); }
        },
        silent: true // Keep logs clean, handle errors manually
    };

    try {
        await exec.exec('az', args, options);
        return output.trim();
    } catch (err) {
        throw new Error(`Azure CLI failed: az ${args.join(' ')}`);
    }
}

export async function deployZip(rg: string, app: string, slot: string, src: string) {
    await exec.exec('az', [
        'webapp', 'deployment', 'source', 'config-zip',
        '--resource-group', rg,
        '--name', app,
        '--slot', slot,
        '--src', src
    ]);
}

export async function updateContainer(rg: string, app: string, slot: string, image: string) {
    await exec.exec('az', [
        'webapp', 'config', 'container', 'set',
        '--resource-group', rg,
        '--name', app,
        '--slot', slot,
        '--docker-custom-image-name', image
    ]);
    // Usually need a restart to force pull the new image immediately
    await exec.exec('az', [
        'webapp', 'restart',
        '--resource-group', rg,
        '--name', app,
        '--slot', slot
    ]);
}

export async function swapSlots(rg: string, app: string, source: string, target: string) {
    await exec.exec('az', [
        'webapp', 'deployment', 'slot', 'swap',
        '--resource-group', rg,
        '--name', app,
        '--slot', source,
        '--target-slot', target
    ]);
}

export async function setAppSetting(rg: string, app: string, slot: string, key: string, val: string) {
    await az([
        'webapp', 'config', 'appsettings', 'set',
        '--resource-group', rg,
        '--name', app,
        '--slot', slot,
        '--settings', `${key}=${val}`
    ]);
}

export async function getSlotUrl(rg: string, app: string, slot: string): Promise<string> {
    const hostname = await az([
        'webapp', 'show',
        '--resource-group', rg,
        '--name', app,
        '--slot', slot,
        '--query', 'defaultHostName',
        '-o', 'tsv'
    ]);
    return `https://${hostname}`;
}