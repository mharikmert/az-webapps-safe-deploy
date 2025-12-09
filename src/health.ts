import * as core from '@actions/core';
import axios from 'axios';
import { getSlotUrl } from './azure';

export async function verifyHealth(
    rg: string,
    app: string,
    slot: string,
    path: string,
    expectedVersion?: string
) {
    // 1. Resolve URL dynamically
    const baseUrl = await getSlotUrl(rg, app, slot);
    const healthUrl = `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;

    core.info(`🩺 Probing: ${healthUrl}`);

    const timeoutMs = 5 * 60 * 1000; // 5 minutes max
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await axios.get(healthUrl, {
                timeout: 5000,
                validateStatus: () => true
            });

            // Only proceed if the app is actually UP
            if (response.status >= 200 && response.status < 300) {

                // --- CASE A: No Version Check (Just Health) ---
                if (!expectedVersion) {
                    core.info(`✅ Health check passed (HTTP ${response.status}).`);
                    return;
                }

                // --- CASE B: Version Check (Smart Match) ---
                const data = response.data;
                let versionFound = false;

                // Strategy 1: Exact Match in JSON (if applicable)
                if (typeof data === 'object' && data !== null) {
                    const jsonVersion = data.version || data.app_version;
                    if (jsonVersion === expectedVersion) {
                        versionFound = true;
                    }
                }

                // Strategy 2: Substring Match (Text/HTML/JSON-String)
                // This handles: "app is up (v1.2.3)" or "Current Version: 1.2.3"
                if (!versionFound) {
                    const bodyString = typeof data === 'string' ? data : JSON.stringify(data);

                    if (bodyString.includes(expectedVersion)) {
                        versionFound = true;
                    }
                }

                if (versionFound) {
                    core.info(`✅ Verified! Found version identifier '${expectedVersion}' in response.`);
                    return;
                } else {
                    // Truncate long HTML responses for cleaner logs
                    const preview = typeof data === 'string'
                        ? data.substring(0, 50).replace(/\n/g, ' ') + '...'
                        : JSON.stringify(data);

                    core.info(`⏳ HTTP ${response.status} OK, but version mismatch.`);
                    core.info(`   Wanted: "${expectedVersion}"`);
                    core.info(`   Got body: "${preview}"`);
                }
            } else {
                core.info(`⏳ App returned HTTP ${response.status}. Waiting for 200 OK...`);
            }
        } catch (err: any) {
            // Network errors (DNS, Connection Refused) usually mean app is restarting
            core.debug(`⚠️ Network probe failed: ${err.message}`);
        }

        // Wait 10s before retry
        await new Promise(r => setTimeout(r, 10000));
    }

    throw new Error(`❌ Health Check Timed Out! Endpoint ${healthUrl} did not become healthy or match version '${expectedVersion}' within 5 minutes.`);
}