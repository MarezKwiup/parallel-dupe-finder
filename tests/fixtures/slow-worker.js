const { parentPort } = require("node:worker_threads");

parentPort.on("message", ({ taskId, data }) => {
    setTimeout(() => {
        parentPort.postMessage({
            taskId,
            result: `processed: ${data}`
        });
    }, 1000);
});