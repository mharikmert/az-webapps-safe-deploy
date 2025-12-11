import * as exec from '@actions/exec';
import * as core from '@actions/core';

// Mock only actions modules
jest.mock('@actions/exec');
jest.mock('@actions/core');

import { inferDeployType, zipFolder, preparePackage, fsUtils } from '../src/helper';

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

    describe('preparePackage', () => {
        let originalExistsSync: typeof fsUtils.existsSync;
        let originalIsDirectory: typeof fsUtils.isDirectory;

        beforeEach(() => {
            // Save originals
            originalExistsSync = fsUtils.existsSync;
            originalIsDirectory = fsUtils.isDirectory;
        });

        afterEach(() => {
            // Restore originals
            fsUtils.existsSync = originalExistsSync;
            fsUtils.isDirectory = originalIsDirectory;
        });

        it('should throw if path does not exist', async () => {
            fsUtils.existsSync = jest.fn().mockReturnValue(false);

            await expect(preparePackage('/nonexistent/path'))
                .rejects
                .toThrow('Package path does not exist: /nonexistent/path');
        });

        it('should zip folder and return type "zip"', async () => {
            fsUtils.existsSync = jest.fn().mockReturnValue(true);
            fsUtils.isDirectory = jest.fn().mockReturnValue(true);

            const result = await preparePackage('/path/to/folder');

            expect(result.type).toBe('zip');
            expect(result.path).toMatch(/deploy-\d+\.zip$/);
            expect(mockExec).toHaveBeenCalledWith(
                'zip',
                expect.any(Array),
                expect.any(Object)
            );
        });

        it('should return file path and inferred type for zip file', async () => {
            fsUtils.existsSync = jest.fn().mockReturnValue(true);
            fsUtils.isDirectory = jest.fn().mockReturnValue(false);

            const result = await preparePackage('/path/to/app.zip');

            expect(result).toEqual({
                path: '/path/to/app.zip',
                type: 'zip'
            });
            expect(mockExec).not.toHaveBeenCalled();
        });

        it('should return file path and inferred type for war file', async () => {
            fsUtils.existsSync = jest.fn().mockReturnValue(true);
            fsUtils.isDirectory = jest.fn().mockReturnValue(false);

            const result = await preparePackage('/path/to/app.war');

            expect(result).toEqual({
                path: '/path/to/app.war',
                type: 'war'
            });
        });

        it('should return file path and inferred type for jar file', async () => {
            fsUtils.existsSync = jest.fn().mockReturnValue(true);
            fsUtils.isDirectory = jest.fn().mockReturnValue(false);

            const result = await preparePackage('/path/to/app.jar');

            expect(result).toEqual({
                path: '/path/to/app.jar',
                type: 'jar'
            });
        });
    });
});
