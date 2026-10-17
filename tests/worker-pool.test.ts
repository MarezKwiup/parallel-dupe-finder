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

    
})

