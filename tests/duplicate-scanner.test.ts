import { describe, it, expect } from "vitest";
import { DuplicateScanner } from "../src/duplicate-scanner";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

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

        const scanner = new DuplicateScanner(2);

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
                reclaimableBytes: 3 * Buffer.byteLength(contentA)
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
        const scanner = new DuplicateScanner(2);

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
        const scanner = new DuplicateScanner(2);

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
})