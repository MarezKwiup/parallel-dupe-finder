#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { DuplicateScanner } from "../duplicate-scanner.js";
import { WorkerPoolError } from "../workers/worker-pool.js";
import { parseCliArgs, UsageError } from "./args.js";
import { formatReport } from "./report.js";

const HELP = `Usage: parallel-dupe-finder [directory] [options]

Find duplicate files in a directory, hashing in parallel with worker threads.

Arguments:
  directory              Folder to scan (default: current folder)

Options:
  -w, --workers <n>      Number of hashing workers (default: CPU cores - 1)
      --min-size <size>  Ignore files smaller than this, e.g. 500, 10kb, 1.5mb
                         (default: 1 byte, so empty files are ignored)
      --exclude <name>   File or folder name to skip; can be repeated
                         (node_modules and .git are always skipped)
      --json             Print the full result as JSON
      --verbose          List every path that could not be read
  -h, --help             Show this help
  -v, --version          Show the version

Sizes use 1024-based units: 1kb = 1024 bytes.`;

async function readVersion(): Promise<string> {
    const pkg = JSON.parse(
        await readFile(new URL("../../package.json", import.meta.url), "utf-8")
    );
    return pkg.version;
}

export async function main(argv: string[]): Promise<number> {
    let command;
    try {
        command = parseCliArgs(argv);
    } catch (err) {
        if (err instanceof UsageError) {
            console.error(`Error: ${err.message}`);
            console.error("Run with --help for usage.");
            return 1;
        }
        throw err;
    }

    switch (command.kind) {
        case "help":
            console.log(HELP);
            return 0;

        case "version":
            console.log(await readVersion());
            return 0;

        case "scan":
            const scanner = new DuplicateScanner(command.options);

            let cancelled = false;
            const onSigint = () => {
                cancelled = true;
                void scanner.shutdown();
            };
            process.once("SIGINT", onSigint);

            try {
                const result = await scanner.scan(command.directory);

                console.log(
                    command.json
                        ? JSON.stringify(result, null, 2)
                        : formatReport(result, command.directory, command.verbose)
                );
                return 0;
            } catch (err) {
                if (cancelled && err instanceof WorkerPoolError) {
                    console.error("Scan cancelled.");
                    return 130;
                }
                console.error(`Error: ${(err as Error).message}`);
                return 1;
            } finally {
                process.removeListener("SIGINT", onSigint);
                await scanner.shutdown();
            }
    }
}

process.exitCode = await main(process.argv.slice(2));