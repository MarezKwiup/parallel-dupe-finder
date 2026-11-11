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

    it("should replace a crashed worker and process queued tasks", async () => {
        const crashWorkerPath = path.resolve(
            process.cwd(),
            "tests/fixtures/crash-worker.js"
        );

        const pool = new WorkerPool<string, string>(
            1,
            crashWorkerPath
        );

        try {
            const failedTask = pool.runTask("crash");

            const queuedTask = pool.runTask("hello");

            const [failedResult, queuedResult] = await Promise.allSettled([
                failedTask,
                queuedTask
            ]);

            expect(failedResult.status).toBe("rejected");

            expect(queuedResult).toEqual({
                status: "fulfilled",
                value: "processed: hello"
            });
        } finally {
            await pool.shutdown();
        }
    })
})

