import * as core from '@actions/core';
import axios from 'axios';
import { getSlotUrl } from './azure';
import { setTimeout as sleep } from 'timers/promises';

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

    const timeoutMs = 5 * 60 * 1000; // 5 minutes max global wait
    const perAttemptTimeoutMs = 20000; // 20s for Cold Starts
    const retryDelayMs = 5000; // Reduced wait between retries to 5s

    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < timeoutMs) {
        attempt += 1;
        const elapsedMs = Date.now() - startTime;
        const remainingMs = Math.max(timeoutMs - elapsedMs, 0);

        // Don't start a request if we have practically no time left
        if (remainingMs < 1000) break;

        const requestTimeout = Math.min(perAttemptTimeoutMs, remainingMs);

        core.info(`🩺 Attempt ${attempt} (elapsed ${Math.round(elapsedMs / 1000)}s)...`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeout);

        try {
            const response = await axios.get(healthUrl, {
                timeout: requestTimeout,
                signal: controller.signal,
                validateStatus: () => true // Prevent throwing on 4xx/5xx
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

                // Strategy 1: Exact Match in JSON
                if (typeof data === 'object' && data !== null) {
                    const jsonVersion = (data as any).version || (data as any).app_version;
                    if (jsonVersion === expectedVersion) {
                        versionFound = true;
                    }
                }

                // Strategy 2: Substring Match
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
                    const preview = typeof data === 'string'
                        ? data.substring(0, 50).replace(/\n/g, ' ') + '...'
                        : JSON.stringify(data);

                    core.info(`⏳ HTTP ${response.status} OK, but version mismatch.`);
                    core.info(`   Wanted: "${expectedVersion}"`);
                    core.info(`   Got body: "${preview}"`);
                }
            } else {
                // Handle 503s (common during startup) gracefully here
                core.info(`⏳ HTTP ${response.status}. Waiting for 2xx...`);
            }
        } catch (err: any) {
            const message = err?.message || 'Unknown error';

            // Differentiate "Fast Fail" (Refused) vs "Slow Fail" (Timeout)
            if (err.code === 'ECONNREFUSED') {
                core.info(`🔌 Connection Refused. App process is starting...`);
            }
            else if (err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED' || message.includes('timeout')) {
                core.info(`🐢 Request Timed Out after ${requestTimeout}ms. App is likely cold-starting.`);
            }
            else {
                core.info(`⚠️ Attempt ${attempt} failed: ${message}. Retrying...`);
            }
        } finally {
            clearTimeout(timer as any);
        }

        // Wait before next attempt
        await sleep(retryDelayMs);
    }

    throw new Error(`❌ Health Check Timed Out! Endpoint ${healthUrl} did not become healthy or match version '${expectedVersion}' within 5 minutes.`);
}