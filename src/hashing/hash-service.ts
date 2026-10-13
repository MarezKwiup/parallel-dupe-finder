import { WorkerPool } from "../workers/worker-pool";

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

    async hashFiles(files: string[]): Promise<HashResult[]> {
        const tasks = files.map((filePath) => 
            this.workerPool.runTask({ filePath })
        );

        return Promise.all(tasks);
    }

    async shutdown(): Promise<void> {
        await this.workerPool.shutdown();
    }
}