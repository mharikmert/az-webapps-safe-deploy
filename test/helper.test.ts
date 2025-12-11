import * as exec from '@actions/exec';
import * as core from '@actions/core';

// Mock only actions modules
jest.mock('@actions/exec');
jest.mock('@actions/core');

import { inferDeployType, zipFolder } from '../src/helper';

const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;

describe('helper.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockResolvedValue(0);
    });

    describe('inferDeployType', () => {
        it('should return "zip" for .zip files', () => {
            expect(inferDeployType('/path/to/app.zip')).toBe('zip');
        });

        it('should return "war" for .war files', () => {
            expect(inferDeployType('/path/to/app.war')).toBe('war');
        });

        it('should return "jar" for .jar files', () => {
            expect(inferDeployType('/path/to/app.jar')).toBe('jar');
        });

        it('should return "ear" for .ear files', () => {
            expect(inferDeployType('/path/to/app.ear')).toBe('ear');
        });

        it('should return "zip" for unknown extensions', () => {
            expect(inferDeployType('/path/to/app.tar.gz')).toBe('zip');
            expect(inferDeployType('/path/to/app.unknown')).toBe('zip');
        });

        it('should handle uppercase extensions', () => {
            expect(inferDeployType('/path/to/app.ZIP')).toBe('zip');
            expect(inferDeployType('/path/to/app.WAR')).toBe('war');
        });

        it('should handle files without extension', () => {
            expect(inferDeployType('/path/to/app')).toBe('zip');
        });
    });

    describe('zipFolder', () => {
        it('should call zip with correct arguments', async () => {
            const result = await zipFolder('/path/to/folder');

            expect(mockExec).toHaveBeenCalledWith(
                'zip',
                ['-q', '-r', expect.stringMatching(/deploy-\d+\.zip$/), '.'],
                { cwd: '/path/to/folder' }
            );
            expect(result).toMatch(/deploy-\d+\.zip$/);
        });

        it('should use RUNNER_TEMP if available', async () => {
            const originalTemp = process.env.RUNNER_TEMP;
            process.env.RUNNER_TEMP = '/runner/temp';

            const result = await zipFolder('/path/to/folder');

            expect(result).toMatch(/^\/runner\/temp\/deploy-\d+\.zip$/);

            // Restore
            if (originalTemp) {
                process.env.RUNNER_TEMP = originalTemp;
            } else {
                delete process.env.RUNNER_TEMP;
            }
        });

        it('should generate unique zip names', async () => {
            const result1 = await zipFolder('/path/to/folder1');
            // Small delay to ensure different timestamp
            await new Promise(r => setTimeout(r, 5));
            const result2 = await zipFolder('/path/to/folder2');

            expect(result1).not.toBe(result2);
        });
    });
});
