const { parentPort } = require("node:worker_threads");

parentPort.on("message", ({ taskId, data }) => {
    if (data === 'fail') {
        parentPort.postMessage({
            taskId,
            error: {
                message: `ENOENT: no such file or directory: ${data}`,
                name: 'ENOENT'
            }
        });

        return;
    }

    parentPort.postMessage({
        taskId,
        result: `processed: ${data}`
    })
})