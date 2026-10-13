import { Worker } from "node:worker_threads";

type WorkerInfo = {
    worker: Worker;
    busy: boolean;
    currentTaskId?: number;
    failed: boolean;
}

type Task<TTask, TResult> = {
    id: number;
    data: TTask;
    resolve: (value: TResult) => void;
    reject: (reason?: any) => void;
}

type PendingTask<TResult> = {
    resolve: (value: TResult) => void;
    reject: (reason?: any) => void;
    workerInfo: WorkerInfo;
}

export class WorkerPool<TTask, TResult> {
    private workers: WorkerInfo[] = [];
    private taskQueue: Task<TTask, TResult>[] = [];
    private pendingTasks = new Map<number, PendingTask<TResult>>();

    private nextTaskId = 0;
    private shuttingDown = false;

    constructor(
        private readonly workerCount: number,
        private readonly workerPath: string
    ) {
        for (let i = 0; i < workerCount; i++) {
            this.workers.push(this.createWorker());
        }
    }

    private createWorker(): WorkerInfo {
        const workerInfo: WorkerInfo = {
            worker: new Worker(this.workerPath),
            busy: false,
            failed: false
        }

        workerInfo.worker.on('message', ({ taskId, result }) => {
            this.handleWorkerMessage(workerInfo, taskId, result);
        })

        workerInfo.worker.on('error', (error: Error) => {
            this.handleWorkerFailure(workerInfo, error);
        })

        workerInfo.worker.on('exit', (code) => {
            if (code !== 0) {
                this.handleWorkerFailure(
                    workerInfo,
                    new Error(`Worker exited with code : ${code}`)
                )
            }
        })

        return workerInfo;
    }

    private handleWorkerMessage(
        workerInfo: WorkerInfo,
        taskId: number,
        result: TResult
    ) {
        const task = this.pendingTasks.get(taskId);

        if (!task) return;

        task.resolve(result);

        this.pendingTasks.delete(taskId);

        workerInfo.currentTaskId = undefined;

        const nextTask = this.taskQueue.shift();

        if (nextTask) {
            this.assignTask(workerInfo, nextTask);
        } else {
            workerInfo.busy = false;
        }
    }

    private assignTask(workerInfo: WorkerInfo, task: Task<TTask, TResult>) {
        workerInfo.busy = true;
        workerInfo.currentTaskId = task.id;

        this.pendingTasks.set(task.id, {
            resolve: task.resolve,
            reject: task.reject,
            workerInfo
        })

        workerInfo.worker.postMessage({
            taskId: task.id,
            data: task.data
        })
    }

    private handleWorkerFailure(workerInfo: WorkerInfo, error: Error) {
        if (workerInfo.failed) return;

        workerInfo.failed = true;

        const taskId = workerInfo.currentTaskId;

        if (taskId !== undefined) {
            const task = this.pendingTasks.get(taskId);

            if (task) {
                task.reject(error);
                this.pendingTasks.delete(taskId);
            }
        }

        const index = this.workers.indexOf(workerInfo);

        if (index !== -1) {
            this.workers.splice(index, 1);
        }

        if (this.shuttingDown) {
            return;
        }

        const replacement = this.createWorker();

        this.workers.push(replacement);

        const nextTask = this.taskQueue.shift();

        if (nextTask) {
            this.assignTask(replacement, nextTask);
        }
    }

    runTask(data: TTask): Promise<TResult> {
        if(this.shuttingDown) {
            return Promise.reject(new Error('Worker pool is shutting down...'));
        }

        return new Promise<TResult>((resolve, reject) => {
            const task: Task<TTask, TResult> = {
                id: this.nextTaskId++,
                data,
                resolve,
                reject
            }

            const availableWorker = this.workers.find((entry) => !entry.busy);

            if (availableWorker) {
                this.assignTask(availableWorker, task);
            } else {
                this.taskQueue.push(task);
            }
        })
    }

    async shutdown() {
        this.shuttingDown = true;

        const error = new Error('Worker pool is shutting down');

        while (this.taskQueue.length > 0) {
            const task = this.taskQueue.shift();
            task?.reject(error);
        } 

        for (const [_, task] of this.pendingTasks) {
            task.reject(error);
        }

        this.pendingTasks.clear();

        await Promise.all(
            this.workers.map(({ worker }) => worker.terminate())
        )

        this.workers = [];
    }
}