import * as core from '@actions/core';
import { updateContainer, deployZip, swapSlots, setAppSetting } from './azure';
import { verifyHealth } from './health';

async function run(): Promise<void> {
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
            await setAppSetting(resourceGroup, appName, slotName, 'APP_VERSION', expectedVersion);
        }

        if (images) {
            core.info(`🐳 Deploying Container to slot '${slotName}'...`);
            await updateContainer(resourceGroup, appName, slotName, images);
        } else if (packagePath) {
            core.info(`📦 Deploying Code to slot '${slotName}'...`);
            await deployZip(resourceGroup, appName, slotName, packagePath);
        }

        // --- Step 2: Verify Initial Slot (Always runs) ---
        // This ensures the code is actually running before we mark 'non-prod' as done
        // OR before we attempt a swap in 'prod'.
        core.info(`🔍 [1/${mode === 'prod' ? '2' : '1'}] Verifying Slot '${slotName}'...`);
        await verifyHealth(resourceGroup, appName, slotName, healthPath, expectedVersion);

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

        await swapSlots(resourceGroup, appName, slotName, targetSlot);

        // Step 4: Verify Production Target
        core.info(`🔍 [2/2] Verifying Production Target '${targetSlot}'...`);
        try {
            await verifyHealth(resourceGroup, appName, targetSlot, healthPath, expectedVersion);
            core.info('✅ Production Swap Verified. Deployment Complete.');
        } catch (err) {
            core.error('❌ PRODUCTION HEALTH CHECK FAILED AFTER SWAP.');
            throw err;
        }

    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();