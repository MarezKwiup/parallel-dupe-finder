import { parentPort } from "node:worker_threads";

parentPort.on('message', ({ taskId, data }) => {
    const { iterations } = data;
    
    if (iterations === 999) {
        throw new Error('Intentional worker crash');
    }

    let result = 0;

    for (let i = 0; i < iterations; i++) {
        result += i;
    }

    parentPort.postMessage({
        taskId,
        result,
    });
})