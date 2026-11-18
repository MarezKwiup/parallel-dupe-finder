import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import os from "node:os";

import { scanDirectory } from "../src/scanner/directory-scanner.js";
import { 
    groupFilesBySize,
    getCandidateFiles,
    findDuplicateGroups,
} from "../src/scanner/group-operations.js";
import { HashService, type HashResult } from "../src/hashing/hash-service.js";

type Strategy = {
    name: string;
    run: (files: string[]) => Promise<HashResult[]>;
};

// Hashing on main thread
async function hashFileOnMainThread(filePath: string): Promise<HashResult> {
    const hash = createHash("sha256");
    await pipeline(createReadStream(filePath), hash);
    return { filePath, hash: hash.digest("hex") };
}

// One file at a time
async function hashSequentially(files: string[]): Promise<HashResult[]> {
    const results: HashResult[] = [];
    for (const file of files) {
        results.push(await hashFileOnMainThread(file));
    }
    return results;
}

// Upto limit files at a time, hashing still on one thread.
async function hashConcurrently(files: string[], limit: number): Promise<HashResult[]> {
    const results: HashResult[] = new Array(files.length);
    let next = 0;
    async function lane() {
        while (next < files.length) {
            const index = next++;
            results[index] = await hashFileOnMainThread(files[index]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, files.length) }, lane));
    return results;
}

// Hashing with worker poool
async function hashWithWorkers(files: string[], workers: number): Promise<HashResult[]> {
    const service = new HashService(workers);
    try {
        const { results, skipped } = await service.hashFiles(files);
        if (skipped.length > 0) {
            throw new Error(`${skipped.length} files could not be hashed`);
        }
        return results;
    } finally {
        await service.shutdown();
    }
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function workerCounts(max: number): number[] {
    const counts: number[] = [];
    for (let n = 1; n < max; n *= 2) counts.push(n);
    counts.push(max);
    return counts;
}

async function main() {
    const { values } = parseArgs({
        options: {
            dir: { type: "string", default: path.join(os.tmpdir(), "dupe-finder-bench") },
            runs: { type: "string", default: "5" },
            "max-workers": { type: "string", default: String(os.availableParallelism()) },
        },
    });

    const dir = path.resolve(values.dir);
    const runs = Number(values.runs);
    const maxWorkers = Number(values["max-workers"]);

    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf-8"));

    const { allFiles } = await scanDirectory(dir);
    const { groups, sizes } = await groupFilesBySize(allFiles, 1);
    const files = getCandidateFiles(groups);
    const totalBytes = files.reduce((sum, file) => sum + sizes.get(file)!, 0);

    const strategies: Strategy[] = [
        { name: "Main thread, sequential", run: hashSequentially },
        { name: "Main thread, 16 concurrent", run: (f) => hashConcurrently(f, 16) },
        ...workerCounts(maxWorkers).map((n) => ({
            name: `Worker pool, ${n} worker${n===1 ? "" : "s"}`,
            run: (f: string[]) => hashWithWorkers(f, n)
        }))
    ];

    const cpus = os.cpus();
    console.log(`CPU: ${cpus[0].model ?? "unknown"} (${cpus.length} cores)`);
    console.log(`Node: ${process.version}`);
    console.log(`OS: ${os.type()} ${os.release()}`);
    console.log(`Dataset: ${files.length} files hashed, ${(totalBytes / 1024 ** 3).toFixed(2)} GB, seed ${manifest.seed}`);
    console.log(`Runs: ${runs} per strategy (median reported), after 1 warm-up pass\n`);

    // Warm up
    process.stderr.write("Warming up file cache...`\n");
    await hashConcurrently(files, 16);

    const rows: { name: string; ms: number }[] = [];
    for (const strategy of strategies) {
        const times: number[] = [];

        for (let i = 0; i < runs; i++) {
            process.stderr.write(`\r${strategy.name}: run ${i + 1}/${runs}`);

            const start = performance.now();
            const results = await strategy.run(files);
            times.push(performance.now() - start);

            // Correctness check
            const duplicates = findDuplicateGroups(results, sizes);
            const redundant = duplicates.reduce((sum, g) => sum + g.files.length - 1, 0);
            if (
                duplicates.length !== manifest.expected.duplicateGroups ||
                redundant !== manifest.expected.redundantFiles
            ) {
                throw new Error(
                    `${strategy.name} found ${duplicates.length} groups / ${redundant} redundant, ` +
                    `expected ${manifest.expected.duplicateGroups} / ${manifest.expected.redundantFiles}`
                );
            }
        }

        rows.push({ name: strategy.name, ms: median(times)});
    }
    process.stderr.write("\r" + " ".repeat(60) + "\r");

    const baseline = rows[0].ms;

    console.log("| Strategy | Median time | Speedup | Throughput |");
    console.log("|---|---:|---:|---:|");
    for (const { name, ms} of rows) {
        const seconds = ms / 1000;
        const throughput = totalBytes / (1024 ** 2) / seconds;
        console.log(
            `| ${name} | ${seconds.toFixed(2)} s | ${(baseline / ms).toFixed(2)}× | ${throughput.toFixed(0)} MB/s |`
        );
    }
}

main().catch((err) => {
    console.error(`\nError: ${(err as Error).message}`);
    process.exitCode = 1;
});