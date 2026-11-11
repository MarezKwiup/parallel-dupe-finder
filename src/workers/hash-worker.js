import { parentPort } from "node:worker_threads";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

parentPort.on('message', async ({ taskId, data }) => {
    try {
        const filePath = data.filePath;
        const hash = createHash('sha256');
        const fileStream = createReadStream(filePath);

        await pipeline(fileStream, hash);

        const digest = hash.digest('hex');

        parentPort.postMessage({
            taskId,
            result: {
                filePath,
                hash: digest
            }
        })
    } catch (err) {
        parentPort.postMessage({
            taskId,
            error: {
                message: err instanceof Error
                    ? err.message
                    : 'Worker failed while hashing',
                name: err instanceof Error ? err.name : 'Error'
            }
        })
    }
})