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
    const perAttemptTimeoutMs = 5000;
    const retryDelayMs = 10000;

    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < timeoutMs) {
        attempt += 1;
        const elapsedMs = Date.now() - startTime;
        const remainingMs = Math.max(timeoutMs - elapsedMs, 0);
        const requestTimeout = Math.min(perAttemptTimeoutMs, remainingMs || perAttemptTimeoutMs);

        core.info(`🩺 Attempt ${attempt} (elapsed ${Math.round(elapsedMs / 1000)}s)...`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeout);

        try {
            const response = await axios.get(healthUrl, {
                timeout: requestTimeout,
                signal: controller.signal
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
                    const jsonVersion = (data as any).version || (data as any).app_version;
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
                core.info(`⏳ HTTP ${response.status}. Waiting for 2xx...`);
            }
        } catch (err: any) {
            const message = err?.message || 'Unknown error';
            if (err?.code === 'ERR_CANCELED') {
                core.info(`⏳ Attempt ${attempt} timed out after ${requestTimeout}ms; retrying...`);
            } else if (err?.response?.status) {
                const status = err.response.status;
                const bodyPreview = typeof err.response.data === 'string'
                    ? err.response.data.substring(0, 80).replace(/\n/g, ' ') + '...'
                    : JSON.stringify(err.response.data);
                core.info(`⏳ Attempt ${attempt} received HTTP ${status}; body: ${bodyPreview}. Retrying...`);
            } else if (message.includes('timeout')) {
                core.info(`⏳ Attempt ${attempt} hit request timeout (${requestTimeout}ms); retrying...`);
            } else {
                core.info(`⏳ Attempt ${attempt} failed: ${message}. Retrying...`);
            }
        } finally {
            clearTimeout(timer);
        }

        await new Promise(r => setTimeout(r, retryDelayMs));
    }

    throw new Error(`❌ Health Check Timed Out! Endpoint ${healthUrl} did not become healthy or match version '${expectedVersion}' within 5 minutes.`);
}