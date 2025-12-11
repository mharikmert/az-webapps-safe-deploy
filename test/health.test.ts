import axios from 'axios';
import * as core from '@actions/core';
import * as azure from '../src/azure';

// Mock modules
jest.mock('axios');
jest.mock('@actions/core');
jest.mock('../src/azure');

// Mock timers for retry logic
jest.mock('timers/promises', () => ({
    setTimeout: jest.fn().mockResolvedValue(undefined)
}));

import { verifyHealth } from '../src/health';

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetSlotUrl = azure.getSlotUrl as jest.MockedFunction<typeof azure.getSlotUrl>;

describe('health.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: return a test URL
        mockGetSlotUrl.mockResolvedValue('https://my-app-staging.azurewebsites.net');
    });

    describe('URL construction', () => {
        it('should construct correct URL with path starting with /', async () => {
            mockAxios.get.mockResolvedValue({ status: 200, data: 'OK' });

            await verifyHealth('rg', 'app', 'staging', '/health');

            expect(mockAxios.get).toHaveBeenCalledWith(
                'https://my-app-staging.azurewebsites.net/health',
                expect.any(Object)
            );
        });

        it('should add leading / to path if missing', async () => {
            mockAxios.get.mockResolvedValue({ status: 200, data: 'OK' });

            await verifyHealth('rg', 'app', 'staging', 'health');

            expect(mockAxios.get).toHaveBeenCalledWith(
                'https://my-app-staging.azurewebsites.net/health',
                expect.any(Object)
            );
        });

        it('should work with root path', async () => {
            mockAxios.get.mockResolvedValue({ status: 200, data: 'OK' });

            await verifyHealth('rg', 'app', 'staging', '/');

            expect(mockAxios.get).toHaveBeenCalledWith(
                'https://my-app-staging.azurewebsites.net/',
                expect.any(Object)
            );
        });
    });

    describe('health check without version', () => {
        it('should pass on 200 response', async () => {
            mockAxios.get.mockResolvedValue({ status: 200, data: 'OK' });

            await expect(verifyHealth('rg', 'app', 'staging', '/health'))
                .resolves
                .toBeUndefined();
        });

        it('should pass on any 2xx response', async () => {
            mockAxios.get.mockResolvedValue({ status: 204, data: '' });

            await expect(verifyHealth('rg', 'app', 'staging', '/health'))
                .resolves
                .toBeUndefined();
        });

        it('should retry on 503 then pass on 200', async () => {
            mockAxios.get
                .mockResolvedValueOnce({ status: 503, data: 'Service Unavailable' })
                .mockResolvedValueOnce({ status: 200, data: 'OK' });

            await verifyHealth('rg', 'app', 'staging', '/health');

            expect(mockAxios.get).toHaveBeenCalledTimes(2);
        });
    });

    describe('version matching', () => {
        describe('JSON version field', () => {
            it('should match version field in JSON response', async () => {
                mockAxios.get.mockResolvedValue({
                    status: 200,
                    data: { version: '1.2.3', status: 'healthy' }
                });

                await expect(verifyHealth('rg', 'app', 'staging', '/health', '1.2.3'))
                    .resolves
                    .toBeUndefined();
            });

            it('should match app_version field in JSON response', async () => {
                mockAxios.get.mockResolvedValue({
                    status: 200,
                    data: { app_version: '1.2.3', status: 'healthy' }
                });

                await expect(verifyHealth('rg', 'app', 'staging', '/health', '1.2.3'))
                    .resolves
                    .toBeUndefined();
            });

            it('should not match if version differs', async () => {
                // Mock Date.now to simulate timeout quickly
                const mockNow = jest.spyOn(Date, 'now');
                let callCount = 0;
                mockNow.mockImplementation(() => {
                    callCount++;
                    // First call: start time = 0
                    // After a few calls, jump past 5 min timeout
                    if (callCount > 3) return 6 * 60 * 1000; // Past timeout
                    return callCount * 1000;
                });

                mockAxios.get.mockResolvedValue({
                    status: 200,
                    data: { version: '1.0.0' }
                });

                await expect(verifyHealth('rg', 'app', 'staging', '/health', '2.0.0'))
                    .rejects
                    .toThrow('Health Check Timed Out');

                mockNow.mockRestore();
            });
        });

        describe('substring matching', () => {
            it('should match version substring in string response', async () => {
                mockAxios.get.mockResolvedValue({
                    status: 200,
                    data: '<html>App v1.2.3 running</html>'
                });

                await expect(verifyHealth('rg', 'app', 'staging', '/', '1.2.3'))
                    .resolves
                    .toBeUndefined();
            });

            it('should match version in JSON stringified response', async () => {
                mockAxios.get.mockResolvedValue({
                    status: 200,
                    data: { build: 'abc123-1.2.3' }
                });

                await expect(verifyHealth('rg', 'app', 'staging', '/', '1.2.3'))
                    .resolves
                    .toBeUndefined();
            });
        });
    });

    describe('error handling', () => {
        it('should handle ECONNREFUSED gracefully', async () => {
            const mockNow = jest.spyOn(Date, 'now');
            let callCount = 0;
            mockNow.mockImplementation(() => {
                callCount++;
                if (callCount > 3) return 6 * 60 * 1000;
                return callCount * 1000;
            });

            const connRefusedError = new Error('connect ECONNREFUSED');
            (connRefusedError as any).code = 'ECONNREFUSED';
            mockAxios.get.mockRejectedValue(connRefusedError);

            await expect(verifyHealth('rg', 'app', 'staging', '/health'))
                .rejects
                .toThrow('Health Check Timed Out');

            expect(core.info).toHaveBeenCalledWith(
                expect.stringContaining('Connection Refused')
            );

            mockNow.mockRestore();
        });

        it('should handle timeout errors gracefully', async () => {
            const mockNow = jest.spyOn(Date, 'now');
            let callCount = 0;
            mockNow.mockImplementation(() => {
                callCount++;
                if (callCount > 3) return 6 * 60 * 1000;
                return callCount * 1000;
            });

            const timeoutError = new Error('timeout of 20000ms exceeded');
            (timeoutError as any).code = 'ECONNABORTED';
            mockAxios.get.mockRejectedValue(timeoutError);

            await expect(verifyHealth('rg', 'app', 'staging', '/health'))
                .rejects
                .toThrow('Health Check Timed Out');

            expect(core.info).toHaveBeenCalledWith(
                expect.stringContaining('Timed Out')
            );

            mockNow.mockRestore();
        });
    });

    describe('retry behavior', () => {
        it('should retry on non-2xx status codes', async () => {
            mockAxios.get
                .mockResolvedValueOnce({ status: 500, data: 'Error' })
                .mockResolvedValueOnce({ status: 503, data: 'Unavailable' })
                .mockResolvedValueOnce({ status: 200, data: 'OK' });

            await verifyHealth('rg', 'app', 'staging', '/health');

            expect(mockAxios.get).toHaveBeenCalledTimes(3);
        });

        it('should continue retrying until version matches', async () => {
            mockAxios.get
                .mockResolvedValueOnce({ status: 200, data: { version: '1.0.0' } })
                .mockResolvedValueOnce({ status: 200, data: { version: '1.0.0' } })
                .mockResolvedValueOnce({ status: 200, data: { version: '2.0.0' } });

            await verifyHealth('rg', 'app', 'staging', '/health', '2.0.0');

            expect(mockAxios.get).toHaveBeenCalledTimes(3);
        });
    });
});

