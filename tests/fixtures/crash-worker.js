const { parentPort } = require("node:worker_threads");

parentPort.on("message", ({ taskId, data }) => {
    if (data === "crash") {
        process.exit(1);
    }

    parentPort.postMessage({
        taskId,
        result: `processed: ${data}`
    })
})

