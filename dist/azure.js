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
exports.deployZip = deployZip;
exports.updateContainer = updateContainer;
exports.swapSlots = swapSlots;
exports.setAppSetting = setAppSetting;
exports.getSlotUrl = getSlotUrl;
const exec = __importStar(require("@actions/exec"));
// Helper to run az commands cleanly
async function az(args) {
    let output = '';
    const options = {
        listeners: {
            stdout: (data) => { output += data.toString(); }
        },
        silent: true // Keep logs clean, handle errors manually
    };
    try {
        await exec.exec('az', args, options);
        return output.trim();
    }
    catch (err) {
        throw new Error(`Azure CLI failed: az ${args.join(' ')}`);
    }
}
async function deployZip(rg, app, slot, src) {
    await exec.exec('az', [
        'webapp', 'deployment', 'source', 'config-zip',
        '--resource-group', rg,
        '--name', app,
        '--slot', slot,
        '--src', src
    ]);
}
async function updateContainer(rg, app, slot, image) {
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
async function swapSlots(rg, app, source, target) {
    await exec.exec('az', [
        'webapp', 'deployment', 'slot', 'swap',
        '--resource-group', rg,
        '--name', app,
        '--slot', source,
        '--target-slot', target
    ]);
}
async function setAppSetting(rg, app, slot, key, val) {
    await az([
        'webapp', 'config', 'appsettings', 'set',
        '--resource-group', rg,
        '--name', app,
        '--slot', slot,
        '--settings', `${key}=${val}`
    ]);
}
async function getSlotUrl(rg, app, slot) {
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
//# sourceMappingURL=azure.js.map