import express, { Request, Response } from "express";
import os from "node:os";
import { WorkerPool } from "./worker-pool";
import { scanDirectory } from "./scanner/directory-scanner";
import { getCandidateFiles, groupFilesBySize } from "./scanner/group-operations";

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

app.post('/scan-files', async(req: Request, res: Response) => {
    try {
        const { directory }: { directory: string } = req.body;

        const files = await scanDirectory(directory);

        const groups = await groupFilesBySize(files);
        const groupObj = Object.fromEntries(groups);

        const candidateFiles = getCandidateFiles(groups);

        res.json({
            message: 'Scan Completed',
            files,
            groups: groupObj,
            candidateFiles
        })
    } catch (err) {
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Scan Failed'
        })
    }
})

const server = app.listen(PORT, () => {
    console.log(`Server listening at PORT: ${PORT}`)
})

async function shutdown() {
    console.log('Shutting down.....');

    server.close(async () => {
        await workerPool.shutdown();

        console.log('Workers terminated');

        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);