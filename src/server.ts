import express, { Request, Response } from "express";
import os from "node:os";
import { WorkerPool } from "./workers/worker-pool";
import { HashService } from "./hashing/hash-service";
import { DuplicateScanner, ScanResult } from "./duplicate-scanner";

const app = express();
const PORT = 3000;

const WORKER_COUNT = Math.max(
    1,
    os.availableParallelism() - 1
);

type ComputeTask = {
    iterations: number
};

type ComputeResult = number;

const workerPool = new WorkerPool<ComputeTask, ComputeResult>(WORKER_COUNT, './src/worker.js');
const duplicateScanner = new DuplicateScanner(WORKER_COUNT);

app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
    res.json({
        message: 'Server is healthy'
    })
})

app.get('/expensive-compute/:iterations', 
    async (req: Request, res: Response) => {
        try {
            const iterations = Number(req.params.iterations);

            if (!Number.isFinite(iterations) || iterations < 0) {
                return res.status(400).json({
                    message: 'Iterations must be a non-negative number',
                })
            }

            const result = await workerPool.runTask({ iterations });

            res.json({
                message: 'Computation finished',
                result
            })
        } catch (err) {
            res.status(500).json({
                message: err instanceof Error ? err.message : 'Computation failed'
            })
        }
    }
)

const hashService = new HashService(WORKER_COUNT);

app.post('/hash-files', async(req: Request, res: Response) => {
    try {
        const files: string[] = req.body.files;
        const results = await hashService.hashFiles(files);

        res.json({
            message: 'Hash completed',
            hashes: results
        })
    } catch (err) {
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Hashing failed'
        })
    }
})

app.post('/scan-files', async(req: Request, res: Response) => {
    try {
        const { directory } = req.body;

        if (typeof directory !== 'string' || !directory.trim()) {
            return res.status(400).json({
                message: 'A valid directory path is required'
            });
        }

        const scanResult: ScanResult = await duplicateScanner.scan(directory);

        res.json({
            message: 'Scan completed',
            ...scanResult
        });
    } catch (err) {
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Scan Failed'
        });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server listening at PORT: ${PORT}`)
})

async function shutdown() {
    console.log('Shutting down.....');

    server.close(async () => {
        try {
            await Promise.all([
                workerPool.shutdown(),
                hashService.shutdown(),
                duplicateScanner.shutdown()
            ]);

            console.log('All workers terminated');
            process.exit(0);
        } catch (err) {
            console.error('Error during shutdown: ', err);
            process.exit(1);
        }
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);