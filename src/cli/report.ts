import path from "node:path";
import type { ScanResult } from "../types.js";
import { formatBytes } from "./format.js";

export function formatReport(result: ScanResult, directory: string, verbose: boolean): string {
    const root = path.resolve(directory);                       
    const duplicates = [...result.duplicates];                  
    const skipped = result.skipped;
    const duplicatesFound = result.duplicates.length !== 0;
    const noDuplicateString = "No duplicates found.";

    const { totalFilesScanned,
        duplicateGroups,
        duplicateFiles,
        redundantFiles,
        reclaimableBytes,
        skippedPaths } = result.summary;

    const duplicateSummary = [                                  
        `Found ${duplicateGroups} duplicate groups (${duplicateFiles} files)`,
        `${formatBytes(reclaimableBytes)} can be reclaimed by removing ${redundantFiles} redundant copies`,
    ].join("\n");

    duplicates.sort((a, b) =>
        ((b.files.length - 1) * b.size - (a.files.length - 1) * a.size)
    );

    const duplicateData = duplicates.map((duplicate, i) => {
        const reclaimable = duplicate.size * (duplicate.files.length - 1);
        const summary = `[${i + 1}] ${formatBytes(duplicate.size)} × ${duplicate.files.length} (${formatBytes(reclaimable)} reclaimable)`;
        const list = duplicate.files.map((file) => `    ${path.relative(root, file)}`);
        return [summary, ...list].join("\n");                   
    });

    const duplicateString = [duplicateSummary, ...duplicateData].join("\n\n");

    const verboseString = [
        "Skipped paths:",
        ...skipped.map((skippedPath) =>
            `    ${path.relative(root, skippedPath.path)} (${skippedPath.stage}: ${skippedPath.code ?? skippedPath.message})`
        ),
    ].join("\n");

    const skippedString = skippedPaths === 0                    
        ? ""
        : verbose
            ? verboseString
            : `⚠ ${skippedPaths} paths could not be read (run with --verbose to list them)`;

    const sections = [
        `Scanned ${totalFilesScanned.toLocaleString()} files in ${root}`,
        duplicatesFound ? duplicateString : noDuplicateString,
        skippedString,
    ];

    return sections.filter((section) => section !== "").join("\n\n");   
}