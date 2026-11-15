import type { SkippedEntry } from "../types";
import { WorkerPool, WorkerPoolError } from "../workers/worker-pool";

export type HashTask = {
    filePath: string;
}

export type HashResult = {
    filePath: string;
    hash: string;
}

export class HashService {
    private workerPool : WorkerPool<HashTask, HashResult>;
    constructor(workerCount: number) {
        this.workerPool = new WorkerPool<HashTask, HashResult>(workerCount, './src/workers/hash-worker.js');
    }

    async hashFiles(files: string[]): Promise<{ results: HashResult[]; skipped: SkippedEntry[]}> {
        const results: HashResult[] = [];
        const skipped: SkippedEntry[] = []
        const tasks = files.map((filePath) => 
            this.workerPool.runTask({ filePath })
        );
        const resp = Promise.allSettled(tasks);
        for (const [index, result] of (await resp).entries()) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                if (result.reason instanceof WorkerPoolError) throw result.reason;
                const e = result.reason as NodeJS.ErrnoException
                skipped.push({
                    path: files[index],
                    stage: 'hash',
                    message: e.message,
                    code: e.code
                })
            }
        }
        return { results, skipped };
    }

    async shutdown(): Promise<void> {
        await this.workerPool.shutdown();
    }
}