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
exports.Action = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const azure_1 = require("./azure");
const health_1 = require("./health");
var Mode;
(function (Mode) {
    Mode["NON_PROD"] = "non-prod";
    Mode["PROD"] = "prod";
})(Mode || (Mode = {}));
var PublishingModel;
(function (PublishingModel) {
    PublishingModel["CODE"] = "code";
    PublishingModel["CONTAINER"] = "container";
})(PublishingModel || (PublishingModel = {}));
class Action {
    constructor() {
        this.azureClient = null;
        this.stepCounter = 0;
        this.totalSteps = 0;
        this.inputs = this.getInputs();
    }
    getInputs() {
        return {
            mode: core.getInput('mode', { required: true }),
            publishing_model: (core.getInput('publishing_model') || 'code'),
            azure_credentials: core.getInput('azure_credentials', { required: true }),
            resource_group: core.getInput('resource_group', { required: true }),
            webapp_name: core.getInput('webapp_name', { required: true }),
            slot_name: core.getInput('slot_name', { required: true }),
            swap_target_slot: core.getInput('swap_target_slot') || 'production',
            node_version: core.getInput('node_version') || '22.x',
            install_command: core.getInput('install_command') || 'npm ci',
            run_tests: core.getBooleanInput('run_tests'),
            test_command: core.getInput('test_command') || 'npm test',
            build_command: core.getInput('build_command') || '',
            node_env: core.getInput('node_env') || 'production',
            version: core.getInput('version', { required: true }),
            version_check_path: core.getInput('version_check_path') || '/',
            container_registry: core.getInput('container_registry') || '',
            container_repository: core.getInput('container_repository') || '',
            container_registry_username: core.getInput('container_registry_username') || '',
            container_registry_password: core.getInput('container_registry_password') || '',
            docker_build_context: core.getInput('docker_build_context') || '.',
            dockerfile: core.getInput('dockerfile') || './Dockerfile',
        };
    }
    logStep(label) {
        this.stepCounter++;
        const separator = '─'.repeat(50);
        core.info(`\n${separator} [${this.stepCounter}/${this.totalSteps}] ${label} ${separator}\n`);
    }
    async validateInputs() {
        this.logStep('Validate mode & publishing model');
        if (this.inputs.mode !== Mode.NON_PROD && this.inputs.mode !== Mode.PROD) {
            throw new Error(`Invalid mode '${this.inputs.mode}'. Expected 'non-prod' or 'prod'.`);
        }
        if (this.inputs.publishing_model !== PublishingModel.CODE && this.inputs.publishing_model !== PublishingModel.CONTAINER) {
            throw new Error(`Invalid publishing_model '${this.inputs.publishing_model}'. Expected 'code' or 'container'.`);
        }
        if (this.inputs.publishing_model === PublishingModel.CONTAINER) {
            if (!this.inputs.container_registry || !this.inputs.container_repository) {
                throw new Error('For publishing_model=container, container_registry and container_repository must be provided.');
            }
        }
        core.info(`Mode: '${this.inputs.mode}'`);
        core.info(`Publishing model: '${this.inputs.publishing_model}'`);
    }
    async initializeAzureClient() {
        this.logStep('Azure Login');
        const creds = JSON.parse(this.inputs.azure_credentials);
        this.azureClient = new azure_1.AzureAppService(creds);
        await this.azureClient.login();
    }
    async setupNodeEnvironment() {
        if (this.inputs.publishing_model !== PublishingModel.CODE) {
            return;
        }
        this.logStep('Set base env vars');
        core.exportVariable('NODE_ENV', this.inputs.node_env);
        this.logStep('Setup Node.js');
        // Note: In a real workflow, users would use actions/setup-node before calling this action
        // We just verify Node.js is available
        await exec.exec('node', ['--version']);
        this.logStep('Install dependencies');
        if (this.inputs.install_command) {
            await exec.exec('sh', ['-c', this.inputs.install_command]);
        }
        if (this.inputs.run_tests) {
            this.logStep('Run tests');
            await exec.exec('sh', ['-c', this.inputs.test_command]);
        }
        if (this.inputs.build_command) {
            this.logStep('Build app');
            await exec.exec('sh', ['-c', this.inputs.build_command]);
        }
    }
    async deployCode() {
        if (this.inputs.publishing_model !== PublishingModel.CODE) {
            return;
        }
        this.logStep('Deploy to slot (code)');
        if (!this.azureClient) {
            throw new Error('Azure client not initialized');
        }
        await exec.exec('az', [
            'webapp', 'deployment', 'source', 'config-zip',
            '--resource-group', this.inputs.resource_group,
            '--name', this.inputs.webapp_name,
            '--slot', this.inputs.slot_name,
            '--src', '.'
        ]);
        core.info('Code deployment completed.');
    }
    async deployContainer() {
        if (this.inputs.publishing_model !== PublishingModel.CONTAINER) {
            return;
        }
        this.logStep('Login to container registry');
        if (this.inputs.container_registry_username && this.inputs.container_registry_password) {
            await exec.exec('docker', [
                'login',
                this.inputs.container_registry,
                '-u', this.inputs.container_registry_username,
                '-p', this.inputs.container_registry_password
            ]);
        }
        this.logStep('Set up Docker Buildx');
        await exec.exec('docker', ['buildx', 'version']);
        // Buildx is usually pre-installed in GitHub Actions runners
        this.logStep('Build & push container image');
        const appVersion = this.inputs.version;
        const imageTag = `${this.inputs.container_registry}/${this.inputs.container_repository}:${appVersion}`;
        const imageTagLatest = `${this.inputs.container_registry}/${this.inputs.container_repository}:latest`;
        await exec.exec('docker', [
            'buildx', 'build',
            '--platform', 'linux/amd64',
            '--file', this.inputs.dockerfile,
            '--push',
            '--tag', imageTag,
            '--tag', imageTagLatest,
            this.inputs.docker_build_context
        ]);
        this.logStep('Deploy container image to slot');
        if (!this.azureClient) {
            throw new Error('Azure client not initialized');
        }
        await this.azureClient.deployContainer(this.inputs.resource_group, this.inputs.webapp_name, this.inputs.slot_name, imageTag);
    }
    async setAppVersion(appVersion) {
        this.logStep('Set APP_VERSION on slot');
        if (!this.azureClient) {
            throw new Error('Azure client not initialized');
        }
        await this.azureClient.setAppSetting(this.inputs.resource_group, this.inputs.webapp_name, this.inputs.slot_name, 'APP_VERSION', appVersion);
    }
    buildHealthCheckUrl(baseUrl, versionCheckPath) {
        if (!versionCheckPath) {
            return baseUrl;
        }
        if (versionCheckPath.startsWith('/')) {
            return `${baseUrl}${versionCheckPath}`;
        }
        return `${baseUrl}/${versionCheckPath}`;
    }
    async healthCheckSlot(appVersion) {
        this.logStep('Resolve slot health check URL');
        if (!this.azureClient) {
            throw new Error('Azure client not initialized');
        }
        const hostname = await this.azureClient.getHostname(this.inputs.resource_group, this.inputs.webapp_name, this.inputs.slot_name);
        const baseUrl = `https://${hostname}`;
        const healthCheckUrl = this.buildHealthCheckUrl(baseUrl, this.inputs.version_check_path);
        this.logStep('Health check slot');
        await (0, health_1.healthCheck)({
            url: healthCheckUrl,
            maxAttempts: 15,
            sleepSeconds: 10,
            label: `slot (${this.inputs.slot_name})`,
            expectedVersion: appVersion,
        });
    }
    async swapSlots() {
        if (this.inputs.mode !== Mode.PROD) {
            return;
        }
        this.logStep('Swap slot -> target (prod mode only)');
        if (!this.azureClient) {
            throw new Error('Azure client not initialized');
        }
        await this.azureClient.swapSlots(this.inputs.resource_group, this.inputs.webapp_name, this.inputs.slot_name, this.inputs.swap_target_slot);
    }
    async healthCheckProduction(appVersion) {
        if (this.inputs.mode !== Mode.PROD) {
            return;
        }
        this.logStep('Resolve production health check URL');
        if (!this.azureClient) {
            throw new Error('Azure client not initialized');
        }
        const hostname = await this.azureClient.getHostname(this.inputs.resource_group, this.inputs.webapp_name, this.inputs.swap_target_slot);
        const baseUrl = `https://${hostname}`;
        const healthCheckUrl = this.buildHealthCheckUrl(baseUrl, this.inputs.version_check_path);
        this.logStep('Health check production after swap');
        await (0, health_1.healthCheck)({
            url: healthCheckUrl,
            maxAttempts: 15,
            sleepSeconds: 10,
            label: 'production after swap',
            expectedVersion: appVersion,
        });
    }
    calculateTotalSteps() {
        let total = 1; // Validate
        if (this.inputs.publishing_model === PublishingModel.CODE) {
            total += 1; // Set base env vars
            total += 1; // Setup Node.js
            total += 1; // Install dependencies
            if (this.inputs.run_tests)
                total += 1;
            if (this.inputs.build_command)
                total += 1;
        }
        total += 1; // Set APP_VERSION
        total += 1; // Azure Login
        if (this.inputs.publishing_model === PublishingModel.CODE) {
            total += 1; // Deploy code
        }
        else {
            total += 4; // Login registry, buildx, build/push, deploy container
        }
        total += 3; // Set APP_VERSION, resolve URL, health check
        if (this.inputs.mode === Mode.PROD) {
            total += 3; // Swap, resolve prod URL, health check prod
        }
        return total;
    }
    async run() {
        try {
            this.totalSteps = this.calculateTotalSteps();
            await this.validateInputs();
            await this.setupNodeEnvironment();
            this.logStep('Set APP_VERSION');
            const appVersion = this.inputs.version;
            await this.initializeAzureClient();
            if (this.inputs.publishing_model === PublishingModel.CODE) {
                await this.deployCode();
            }
            else {
                await this.deployContainer();
            }
            await this.setAppVersion(appVersion);
            await this.healthCheckSlot(appVersion);
            if (this.inputs.mode === Mode.PROD) {
                await this.swapSlots();
                await this.healthCheckProduction(appVersion);
            }
            core.info('✅ Deployment completed successfully!');
        }
        catch (error) {
            core.setFailed(error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
}
exports.Action = Action;
// Main execution
async function main() {
    const action = new Action();
    await action.run();
}
main().catch(error => {
    core.setFailed(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
//# sourceMappingURL=index.js.map