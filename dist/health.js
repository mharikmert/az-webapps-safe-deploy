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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyHealth = verifyHealth;
const core = __importStar(require("@actions/core"));
const axios_1 = __importDefault(require("axios"));
const azure_1 = require("./azure");
async function verifyHealth(rg, app, slot, path, expectedVersion) {
    // 1. Resolve URL dynamically
    const baseUrl = await (0, azure_1.getSlotUrl)(rg, app, slot);
    const healthUrl = `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    core.info(`🩺 Probing: ${healthUrl}`);
    const timeoutMs = 5 * 60 * 1000; // 5 minutes max
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await axios_1.default.get(healthUrl, {
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
                }
                else {
                    // Truncate long HTML responses for cleaner logs
                    const preview = typeof data === 'string'
                        ? data.substring(0, 50).replace(/\n/g, ' ') + '...'
                        : JSON.stringify(data);
                    core.info(`⏳ HTTP ${response.status} OK, but version mismatch.`);
                    core.info(`   Wanted: "${expectedVersion}"`);
                    core.info(`   Got body: "${preview}"`);
                }
            }
            else {
                core.info(`⏳ App returned HTTP ${response.status}. Waiting for 200 OK...`);
            }
        }
        catch (err) {
            // Network errors (DNS, Connection Refused) usually mean app is restarting
            core.debug(`⚠️ Network probe failed: ${err.message}`);
        }
        // Wait 10s before retry
        await new Promise(r => setTimeout(r, 10000));
    }
    throw new Error(`❌ Health Check Timed Out! Endpoint ${healthUrl} did not become healthy or match version '${expectedVersion}' within 5 minutes.`);
}
//# sourceMappingURL=health.js.map