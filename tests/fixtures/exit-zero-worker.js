const { parentPort } = require("node:worker_threads");

parentPort.on("message", ({ taskId, data }) => {
    if (data === "exit") {
        process.exit(0);
    }

    parentPort.postMessage({
        taskId,
        result: `processed: ${data}`
    });
});