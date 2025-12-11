import * as exec from '@actions/exec';
import * as helper from '../src/helper';

// Mock the modules
jest.mock('@actions/exec');
jest.mock('@actions/core');
jest.mock('../src/helper');

// Import after mocking
import { deployPackage, deployContainer, swapSlots, setAppSettings, getSlotUrl } from '../src/azure';

const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
const mockPreparePackage = helper.preparePackage as jest.MockedFunction<typeof helper.preparePackage>;

describe('azure.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: simulate successful exec
        mockExec.mockResolvedValue(0);
        // Default: preparePackage returns the path as-is with type 'zip'
        mockPreparePackage.mockImplementation(async (srcPath) => ({
            path: srcPath,
            type: 'zip'
        }));
    });

    describe('addSlotArg behavior (tested through exported functions)', () => {
        it('should NOT add --slot for "production" slot (case-insensitive)', async () => {
            await deployPackage('my-rg', 'my-app', 'production', '/app.zip');

            expect(mockExec).toHaveBeenCalledWith(
                'az',
                expect.not.arrayContaining(['--slot']),
                expect.any(Object)
            );
        });

        it('should NOT add --slot for "Production" slot (uppercase)', async () => {
            await deployPackage('my-rg', 'my-app', 'Production', '/app.zip');

            expect(mockExec).toHaveBeenCalledWith(
                'az',
                expect.not.arrayContaining(['--slot']),
                expect.any(Object)
            );
        });

        it('should add --slot for non-production slots', async () => {
            await deployPackage('my-rg', 'my-app', 'staging', '/app.zip');

            expect(mockExec).toHaveBeenCalledWith(
                'az',
                expect.arrayContaining(['--slot', 'staging']),
                expect.any(Object)
            );
        });
    });

    describe('deployPackage', () => {
        it('should call az webapp deploy with correct arguments', async () => {
            await deployPackage('my-rg', 'my-app', 'staging', '/path/to/app.zip');

            expect(mockPreparePackage).toHaveBeenCalledWith('/path/to/app.zip');
            expect(mockExec).toHaveBeenCalledWith(
                'az',
                [
                    'webapp', 'deploy',
                    '--resource-group', 'my-rg',
                    '--name', 'my-app',
                    '--src-path', '/path/to/app.zip',
                    '--type', 'zip',
                    '--async', 'false',
                    '--slot', 'staging'
                ],
                expect.objectContaining({ silent: true })
            );
        });

        it('should use deploy type from preparePackage', async () => {
            mockPreparePackage.mockResolvedValue({ path: '/path/to/app.war', type: 'war' });

            await deployPackage('my-rg', 'my-app', 'staging', '/path/to/app.war');

            expect(mockExec).toHaveBeenCalledWith(
                'az',
                expect.arrayContaining(['--type', 'war']),
                expect.any(Object)
            );
        });

        it('should deploy folder as zip (auto-zipped by preparePackage)', async () => {
            // Simulate preparePackage receiving a folder and returning a zipped path
            mockPreparePackage.mockResolvedValue({
                path: '/tmp/deploy-1234567890.zip',
                type: 'zip'
            });

            await deployPackage('my-rg', 'my-app', 'staging', '/path/to/dist');

            expect(mockPreparePackage).toHaveBeenCalledWith('/path/to/dist');
            expect(mockExec).toHaveBeenCalledWith(
                'az',
                [
                    'webapp', 'deploy',
                    '--resource-group', 'my-rg',
                    '--name', 'my-app',
                    '--src-path', '/tmp/deploy-1234567890.zip',
                    '--type', 'zip',
                    '--async', 'false',
                    '--slot', 'staging'
                ],
                expect.any(Object)
            );
        });

        it('should throw with Azure error message on failure', async () => {
            // Simulate Azure CLI error
            mockExec.mockImplementation(async (_cmd, _args, options) => {
                if (options?.listeners?.stderr) {
                    options.listeners.stderr(Buffer.from('Deployment failed: quota exceeded'));
                }
                throw new Error('Process failed');
            });

            await expect(deployPackage('rg', 'app', 'staging', '/app.zip'))
                .rejects
                .toThrow('Azure CLI failed: Deployment failed: quota exceeded');
        });
    });

    describe('deployContainer', () => {
        it('should call az webapp config container set with correct arguments', async () => {
            await deployContainer('my-rg', 'my-app', 'staging', 'myregistry.azurecr.io/myimage:v1');

            expect(mockExec).toHaveBeenCalledWith(
                'az',
                [
                    'webapp', 'config', 'container', 'set',
                    '--resource-group', 'my-rg',
                    '--name', 'my-app',
                    '--docker-custom-image-name', 'myregistry.azurecr.io/myimage:v1',
                    '--slot', 'staging'
                ],
                expect.any(Object)
            );
        });
    });

    describe('swapSlots', () => {
        it('should call az webapp deployment slot swap with correct arguments', async () => {
            await swapSlots('my-rg', 'my-app', 'staging', 'production');

            expect(mockExec).toHaveBeenCalledWith(
                'az',
                [
                    'webapp', 'deployment', 'slot', 'swap',
                    '--resource-group', 'my-rg',
                    '--name', 'my-app',
                    '--slot', 'staging',
                    '--target-slot', 'production'
                ],
                expect.any(Object)
            );
        });
    });

    describe('setAppSettings', () => {
        it('should call az webapp config appsettings set with correct arguments', async () => {
            await setAppSettings('my-rg', 'my-app', 'staging', {
                'APP_VERSION': '1.2.3',
                'NODE_ENV': 'production'
            });

            expect(mockExec).toHaveBeenCalledWith(
                'az',
                [
                    'webapp', 'config', 'appsettings', 'set',
                    '--resource-group', 'my-rg',
                    '--name', 'my-app',
                    '--settings', 'APP_VERSION=1.2.3', 'NODE_ENV=production',
                    '--slot', 'staging'
                ],
                expect.any(Object)
            );
        });

        it('should do nothing if settings object is empty', async () => {
            await setAppSettings('my-rg', 'my-app', 'staging', {});

            expect(mockExec).not.toHaveBeenCalled();
        });
    });

    describe('getSlotUrl', () => {
        it('should return https URL from hostname', async () => {
            mockExec.mockImplementation(async (_cmd, _args, options) => {
                if (options?.listeners?.stdout) {
                    options.listeners.stdout(Buffer.from('my-app-staging.azurewebsites.net'));
                }
                return 0;
            });

            const url = await getSlotUrl('my-rg', 'my-app', 'staging');

            expect(url).toBe('https://my-app-staging.azurewebsites.net');
        });

        it('should throw if hostname is empty', async () => {
            mockExec.mockImplementation(async (_cmd, _args, options) => {
                if (options?.listeners?.stdout) {
                    options.listeners.stdout(Buffer.from(''));
                }
                return 0;
            });

            await expect(getSlotUrl('my-rg', 'my-app', 'staging'))
                .rejects
                .toThrow('Could not resolve hostname');
        });

        it('should query without --slot for production', async () => {
            mockExec.mockImplementation(async (_cmd, _args, options) => {
                if (options?.listeners?.stdout) {
                    options.listeners.stdout(Buffer.from('my-app.azurewebsites.net'));
                }
                return 0;
            });

            await getSlotUrl('my-rg', 'my-app', 'production');

            expect(mockExec).toHaveBeenCalledWith(
                'az',
                expect.not.arrayContaining(['--slot']),
                expect.any(Object)
            );
        });
    });
});

