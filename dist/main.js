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
const core = __importStar(require("@actions/core"));
const azure_1 = require("./azure");
const health_1 = require("./health");
async function run() {
    try {
        // Inputs 
        const appName = core.getInput('app_name', { required: true });
        const resourceGroup = core.getInput('resource_group', { required: true });
        const slotName = core.getInput('slot_name', { required: true }); // e.g., 'staging' or 'dev'
        const mode = core.getInput('mode') || 'non-prod';
        // Artifacts 
        const packagePath = core.getInput('package_path');
        const images = core.getInput('images');
        // Verification config 
        const healthPath = core.getInput('health_check_path') || '/';
        const expectedVersion = core.getInput('expected_version');
        // Validation 
        if (!packagePath && !images) {
            throw new Error("❌ You must provide either 'package_path' (Code) or 'images' (Container).");
        }
        // --- Step 1: Deploy to the Initial Slot ---
        if (expectedVersion) {
            core.info(`⚙️  Setting APP_VERSION=${expectedVersion} on slot '${slotName}'...`);
            await (0, azure_1.setAppSetting)(resourceGroup, appName, slotName, 'APP_VERSION', expectedVersion);
        }
        if (images) {
            core.info(`🐳 Deploying Container to slot '${slotName}'...`);
            await (0, azure_1.updateContainer)(resourceGroup, appName, slotName, images);
        }
        else if (packagePath) {
            core.info(`📦 Deploying Code to slot '${slotName}'...`);
            await (0, azure_1.deployZip)(resourceGroup, appName, slotName, packagePath);
        }
        // --- Step 2: Verify Initial Slot (Always runs) ---
        // This ensures the code is actually running before we mark 'non-prod' as done
        // OR before we attempt a swap in 'prod'.
        core.info(`🔍 [1/${mode === 'prod' ? '2' : '1'}] Verifying Slot '${slotName}'...`);
        await (0, health_1.verifyHealth)(resourceGroup, appName, slotName, healthPath, expectedVersion);
        // --- Step 3: Branching Logic ---
        if (mode !== 'prod') {
            // CASE A: Non-Prod (Dev/Test)
            // We deployed, we verified, we are done.
            core.info(`✅ Non-Prod deployment to '${slotName}' successful.`);
            return;
        }
        // CASE B: Prod (Swap & Re-Verify)
        const targetSlot = core.getInput('swap_target') || 'production';
        core.info(`🚀 Mode is 'prod'. Swapping '${slotName}' -> '${targetSlot}'...`);
        await (0, azure_1.swapSlots)(resourceGroup, appName, slotName, targetSlot);
        // Step 4: Verify Production Target
        core.info(`🔍 [2/2] Verifying Production Target '${targetSlot}'...`);
        try {
            await (0, health_1.verifyHealth)(resourceGroup, appName, targetSlot, healthPath, expectedVersion);
            core.info('✅ Production Swap Verified. Deployment Complete.');
        }
        catch (err) {
            core.error('❌ PRODUCTION HEALTH CHECK FAILED AFTER SWAP.');
            throw err;
        }
    }
    catch (error) {
        if (error instanceof Error)
            core.setFailed(error.message);
    }
}
run();
//# sourceMappingURL=main.js.map