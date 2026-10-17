import { parentPort } from "node:worker_threads";

parentPort.on("message", ({ taskId, data }) => {
    parentPort.postMessage({
        taskId,
        result: data * 2
    })
})