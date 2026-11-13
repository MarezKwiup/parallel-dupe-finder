import { describe, it, expect, vi } from "vitest";
import { WorkerPool } from "../src/workers/worker-pool";
import path from "node:path";
import process from "node:process";

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
            .rejects.toThrow("Worker pool is shutting down...")
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

    it("should reject pending and queued tasks during shutdown", async () => {
        const slowWorkerPath = path.resolve(
            process.cwd(),
            "tests/fixtures/slow-worker.js"
        );

        const pool = new WorkerPool<string, string>(1, slowWorkerPath);

        const firstTask = pool.runTask("first");
        const secondTask = pool.runTask("second");

        const outcomesPromise = Promise.allSettled([
            firstTask,
            secondTask
        ]);

        await pool.shutdown();

        const outcomes = await outcomesPromise;

        expect(outcomes).toHaveLength(2);

        for (const outcome of outcomes) {
            expect(outcome.status).toBe("rejected");

            if (outcome.status === 'rejected') {
                expect(outcome.reason.message).toBe(
                    "Worker pool is shutting down..."
                );
            }
        }

        await expect(pool.runTask("third"))
            .rejects.toThrow("Worker pool is shutting down...");
    })

    it("should recover when a worker exits unexpectedly with code 0", async () => {
        const exitWorkerPath = path.resolve(
            process.cwd(),
            "tests/fixtures/exit-zero-worker.js"
        );

        const pool = new WorkerPool<string, string>(1, exitWorkerPath);

        try {
            const failedTask = pool.runTask("exit");
            const queuedTask = pool.runTask("hello");

            const outcomesPromise = Promise.allSettled([
                failedTask,
                queuedTask
            ]);

            let timeoutId: ReturnType<typeof setTimeout> | undefined;

            const outcomes = await Promise.race([
                outcomesPromise,
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(
                        () => reject(new Error("Worker recovery timed out")),
                        1500
                    );
                })
            ]).finally(() => {
                if (timeoutId) clearTimeout(timeoutId);
            });

            expect(outcomes[0].status).toBe("rejected");

            expect(outcomes[1]).toEqual({
                status: "fulfilled",
                value: "processed: hello"
            });
        } finally {
            await pool.shutdown();
        }
    })

    it("should reject task-level error, not kill the worker", async () => {
        const failWorkerPath = path.resolve(
            process.cwd(),
            "tests/fixtures/fail-worker.js"
        );

        const pool = new WorkerPool<string, string>(1, failWorkerPath);

        try {
            const failedTask = pool.runTask("fail");
            const queuedTask = pool.runTask("queued");

            const outcomesPromise = Promise.allSettled([
                failedTask,
                queuedTask
            ]);

            const outcomes = await outcomesPromise;

            expect(outcomes[0]).toMatchObject({
                status: "rejected",
                reason: {
                    message: "ENOENT: no such file or directory: fail",
                    name: "ENOENT"
                }
            });
            expect(outcomes[1]).toEqual({
                status: "fulfilled",
                value: "processed: queued"
            });
        } finally {
            await pool.shutdown();
        }
    })

    it("should only accept positive integer worker count", async () => {
        const workerPath = path.resolve(
            process.cwd(),
            "tests/fixtures/echo-worker.js"
        );
        
        expect(() => new WorkerPool<string, string>(0, workerPath)).toThrow();
        expect(() => new WorkerPool<string, string>(-1, workerPath)).toThrow();
        expect(() => new WorkerPool<string, string>(1.5, workerPath)).toThrow();
        expect(() => new WorkerPool<string, string>(NaN, workerPath)).toThrow();

        let pool: WorkerPool<number, number> | undefined;
        try {
            expect(() => {
                pool = new WorkerPool<number, number>(1, workerPath);
            }).not.toThrow();

            expect(pool).toBeInstanceOf(WorkerPool);

            expect(await pool!.runTask(21)).toBe(42);
        } finally {
            await pool!.shutdown();
        }
    });

    it("should stop respawning when workers crash on startup", async () => {
        const brokenWorkerPath = path.resolve(
            process.cwd(),
            "tests/fixtures/broken-worker.js"
        );

        const pool = new WorkerPool<string, string>(1, brokenWorkerPath);

        try {
            const firstTask = pool.runTask("first");
            const secondTask = pool.runTask("second");
            const thirdTask = pool.runTask("third");

            const outcomesPromise = Promise.allSettled([ firstTask, secondTask, thirdTask ]);

            let timeoutId: ReturnType<typeof setTimeout> | undefined;

            const outcomes = await Promise.race([
                outcomesPromise,
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(
                        () => reject(new Error("Worker recovery timed out")),
                        1500
                    );
                })
            ]).finally(() => {
                if (timeoutId) clearTimeout(timeoutId);
            });

            expect(outcomes[0].status).toBe("rejected");
            expect(outcomes[1].status).toBe("rejected");

            await vi.waitFor(() => expect(pool.size).toBe(0), { timeout: 1500 });

            await expect(pool.runTask("fourth")).rejects.toThrow();
        } finally {
            await pool.shutdown();
        }
    })
});

