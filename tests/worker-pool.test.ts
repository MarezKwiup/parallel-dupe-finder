import { describe, it, expect } from "vitest";
import { WorkerPool } from "../src/workers/worker-pool";
import path from "node:path";

const workerPath = path.resolve(
    process.cwd(),
    "tests/fixtures/echo-worker.js"
);

describe("WorkerPool", () => {
    it("should execute a task and return its result", async () => {
        const pool = new WorkerPool<number, number>(1, workerPath);

        try {
            const result = await pool.runTask(21);
            expect(result).toBe(42);
        } finally {
            await pool.shutdown();
        }
    })

    it("should process multiple queued tasks correctly", async () => {
        const pool = new WorkerPool<number, number>(1, workerPath);

        try {
            const results = await Promise.all([
                pool.runTask(1),
                pool.runTask(2),
                pool.runTask(3)
            ]);

            expect(results).toEqual([2, 4, 6]);
        } finally {
            await pool.shutdown();
        }
    })

    it("should reject new tasks after shutdown", async () => {
        const pool = new WorkerPool<number, number>(1, workerPath);

        await pool.shutdown();

        await expect(pool.runTask(10))
            .rejects.toThrow("Worker pool is shutting down")
    })
})

