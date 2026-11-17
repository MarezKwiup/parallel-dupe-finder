import { parseArgs } from "node:util";
import { DEFAULT_EXCLUDE } from "../duplicate-scanner.js";
import { parseSize } from "./format.js";
import type { ScanOptions } from "../types.js";

export class UsageError extends Error {
    override name = "UsageError";
}

export type CliCommand = 
    | { kind: "help" }
    | { kind: "version" }
    | {
        kind: "scan";
        directory: string;
        options: ScanOptions;
        json: boolean;
        verbose: boolean;
    }

export function parseCliArgs(argv: string[]): CliCommand {
    let parsed;
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            strict: true,
            options: {
                workers: { type: "string", short: "w" },
                "min-size": { type: "string" },
                exclude: { type: "string", multiple: true },
                json: { type: "boolean" },
                verbose: { type: "boolean" },
                help: { type: "boolean", short: "h" },
                version: { type: "boolean", short: "v" },
            },
        });
    } catch (err) {
        throw new UsageError((err as Error).message);
    }

    const { values, positionals } = parsed;

    if (values.help) return { kind: "help" };
    if (values.version) return { kind: "version" };

    if (positionals.length > 1) {
        throw new UsageError(
            `Expected one directory, got ${positionals.length}: ${positionals.join(", ")}`
        );
    }

    const options: ScanOptions = {
        exclude: [...DEFAULT_EXCLUDE, ...(values.exclude ?? [])],
    };

    if (values.workers !== undefined) {
        const workers = Number(values.workers);

        if (!Number.isInteger(workers) || workers <= 0) {
            throw new UsageError(
                `--workers must be a positive integer, got "${values.workers}"`
            );
        }

        options.workers = workers;
    }

    if (values["min-size"] !== undefined) {
        try {
            options.minSize = parseSize(values["min-size"]);
        } catch {
            throw new UsageError(
                `--min-size must be a size like 500, 10kb or 1.5mb got "${values["min-size"]}"`
            );
        }
    }

    return {
        kind: "scan",
        directory: positionals[0] ?? ".",
        options,
        json: values.json ?? false,
        verbose: values.verbose ?? false
    };
}