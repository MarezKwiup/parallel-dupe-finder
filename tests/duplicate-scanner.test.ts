import { describe, it, expect } from "vitest";
import { DuplicateScanner } from "../src/duplicate-scanner";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Buffer } from "node:buffer";
import * as fs from 'fs/promises';

async function createdFixedSizeFile(size: number, filePath: string, textContent: string) {
    let buffer = Buffer.from(textContent, 'utf-8');

    if (buffer.length > size) buffer = buffer.subarray(0, size);
    else if (buffer.length < size) {
        const padding = Buffer.alloc(size - buffer.length, '');
        buffer = Buffer.concat([buffer, padding]);
    }

    await fs.writeFile(filePath, buffer);
}

describe("DuplicateScanner integration tests", () => {
    it("should detect duplicates and calculate correct summary", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "dupe-finder-")
        );

        const nestedDir = path.join(tempDir, "nested");
        await mkdir(nestedDir);

        const contentA = "same duplicate text A";
        const contentB = "same duplicate text B";
        const uniqueContent = "unique file with different size";

        const scanner = new DuplicateScanner({ workers: 2 });

        try {
            await writeFile(path.join(tempDir, "a.txt"), contentA);
            await writeFile(path.join(tempDir, "b.txt"), contentA);
            await writeFile(path.join(nestedDir, "c.txt"), contentA);

            await writeFile(path.join(tempDir, "d.txt"), contentB);
            await writeFile(path.join(tempDir, "e.txt"), contentB);

            await writeFile(
                path.join(tempDir, "unique.txt"),
                uniqueContent
            );

            const result = await scanner.scan(tempDir);

            expect(result.summary).toEqual({
                totalFilesScanned: 6,
                candidateFiles: 5,
                duplicateGroups: 2,
                duplicateFiles: 5,
                redundantFiles: 3,
                reclaimableBytes: 3 * Buffer.byteLength(contentA),
                skippedPaths: 0
            });

            expect(
                result.duplicates
                    .map(group => group.files.length)
                    .sort()
            ).toEqual([2, 3]);
        } finally {
            await scanner.shutdown();
            await rm(tempDir, {
                recursive: true,
                force: true
            })
        }
    });

    it("should handle an empty directory", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "dupe-finder-")
        );
        const scanner = new DuplicateScanner({ workers: 2 });

        try {
            const result = await scanner.scan(tempDir);

            expect(result.summary.totalFilesScanned).toBe(0);
            expect(result.summary.candidateFiles).toBe(0);
            expect(result.summary.duplicateGroups).toBe(0);
            expect(result.summary.reclaimableBytes).toBe(0);
            expect(result.duplicates).toEqual([]);
        } finally {
            await scanner.shutdown();
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("should not report files with identical sizes but different content as duplicates", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "dupe-finder-")
        );
        const scanner = new DuplicateScanner({ workers: 2 });

        try {
            await writeFile(path.join(tempDir, "a.txt"), "hello");
            await writeFile(path.join(tempDir, "b.txt"), "world");

            const result = await scanner.scan(tempDir);

            expect(result.summary.totalFilesScanned).toBe(2);
            expect(result.summary.candidateFiles).toBe(2);
            expect(result.summary.duplicateGroups).toBe(0);
            expect(result.summary.reclaimableBytes).toBe(0);
            expect(result.duplicates).toEqual([]);
        } finally {
            await scanner.shutdown();
            await rm(tempDir, { recursive: true, force: true });
        }
    })

    it("skips excluded paths", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "dupe-finder-"));
        const scanner = new DuplicateScanner({ workers: 2, exclude: ["excluded"] });

        try {
            const excludedDir = path.join(tempDir, "excluded");
            await mkdir(excludedDir);

            const fileA = path.join(tempDir, "a.txt");
            const fileB = path.join(tempDir, "b.txt");

            await Promise.all([
                writeFile(fileA, "hello"),
                writeFile(fileB, "hello"),
                writeFile(path.join(excludedDir, "c.txt"), "hello"),
                writeFile(path.join(excludedDir, "d.txt"), "hello"),
            ]);

            const result = await scanner.scan(tempDir);

            expect(result.summary.totalFilesScanned).toBe(2);
            expect(result.duplicates).toHaveLength(1);
            expect(result.duplicates[0].files.sort()).toEqual([fileA, fileB].sort());
        } finally {
            await scanner.shutdown();
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("requires min size to be a non-negative integer", async () => {
       expect(() => new DuplicateScanner({ workers: 2, minSize: -1 })).toThrow(RangeError);
       expect(() => new DuplicateScanner({ workers: 2, minSize: 1.5 })).toThrow(RangeError);
    });

    it("skips files with sizes less than provided minSize", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "dupe-finder-"));
        const scanner = new DuplicateScanner({ workers: 2, minSize: 10 });
        try {
            const fileA = path.join(tempDir, 'a.txt');
            const fileB = path.join(tempDir, 'b.txt');
            const fileC = path.join(tempDir, 'c.txt');
            const fileD = path.join(tempDir, 'd.txt');
            await Promise.all([
                createdFixedSizeFile(50, fileA, "hello"),
                createdFixedSizeFile(50, fileB, "hello"),
                createdFixedSizeFile(5, fileC, "world"),
                createdFixedSizeFile(5, fileD, "world"),
            ]);
            const result = await scanner.scan(tempDir);
            console.log("result is : ", result);

            expect(result.summary.totalFilesScanned).toBe(4);
            expect(result.summary.candidateFiles).toBe(2);
            expect(result.duplicates).toHaveLength(1);
            expect(result.duplicates[0].files.sort()).toEqual([fileA, fileB].sort());
        } finally {
            await scanner.shutdown();
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("skips empty files", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "dupe-finder-"));
        const scanner = new DuplicateScanner({ workers: 2, minSize: 10 });
        try {
            const fileA = path.join(tempDir, 'a.txt');
            await fs.writeFile(fileA, '');
            const fileB = path.join(tempDir, 'b.txt');
            await fs.writeFile(fileB, '');
            const result = await scanner.scan(tempDir);
            expect(result.summary.totalFilesScanned).toBe(2);
            expect(result.summary.duplicateFiles).toBe(0);
        } finally {
            await scanner.shutdown();
            await rm(tempDir, { recursive: true, force: true });
        }
    });
})