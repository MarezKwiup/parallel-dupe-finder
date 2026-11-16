import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { HashService } from '../src/hashing/hash-service.js'; 
import { WorkerPoolError } from "../src/workers/worker-pool.js";

describe("HashService", () => {
    it("hashes files and skips missing/deleted files", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "dupe-finder-")
        );

        const realFile = path.join(tempDir, "real.txt");
        await writeFile(realFile, "Hello world");
        const hashService = new HashService(1);
        try {
            const { results, skipped } = await hashService.hashFiles([realFile, path.join(tempDir, "missing.txt")]);

            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                filePath: realFile
            });
            expect(skipped).toHaveLength(1);
            expect(skipped[0]).toMatchObject({
                path: path.join(tempDir, "missing.txt"),
                stage: "hash",
                code: "ENOENT"
            });
        } finally {
            await hashService.shutdown();
            await rm(tempDir, {
                recursive: true,
                force: true
            });
        }   
    });

    it("throws on worker pool error", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "dupe-finder-")
        );

        const realFile = path.join(tempDir, "real.txt");
        await writeFile(realFile, "Hello world");
        try {
            const hashService = new HashService(1);
            
            await hashService.shutdown();

            await (expect(hashService.hashFiles([realFile]))).rejects.toBeInstanceOf(WorkerPoolError);
        } finally {
            await rm(tempDir, {
                recursive: true,
                force: true
            });
        }   
    });
})
