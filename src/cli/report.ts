import path from "node:path";
import { ScanResult } from "../types.js";
import { formatBytes } from "./format.js";

export function formatReport(result: ScanResult, directory: string, verbose: boolean): string {
    const duplicates = result.duplicates;
    const skipped = result.skipped;
    const duplicatesFound = result.duplicates.length !== 0;
    const noDuplicateString = "No duplicates found.";

    const { totalFilesScanned,
        duplicateGroups,
        duplicateFiles,
        redundantFiles,
        reclaimableBytes,
        skippedPaths } = result.summary;

    const duplicateSummary = `
    Found ${duplicateGroups} duplicate groups (${duplicateFiles} files)
    ${formatBytes(reclaimableBytes)} can be reclaimed by removing ${redundantFiles} redundant copies
    `;
    
    duplicates.sort((a, b) => 
        ((b.files.length - 1) * b.size - (a.files.length - 1) * a.size)
    );

    const duplicateData = duplicates.map((duplicate, i) => {
        const reclaimable = duplicate.size * (duplicate.files.length - 1);
        const summary = `[${i + 1}] ${formatBytes(duplicate.size)} * ${duplicate.files.length} (${formatBytes(reclaimable)} reclaimable)`;
        const list = duplicate.files.map((file) => `
            ${path.relative(directory, file)}
        `);
        return summary + list.join("\n");
    });

    const duplicateString = duplicateSummary + duplicateData.join("\n");

    const verboseString = `Skipped paths: ${skipped.map((skippedPath) => `
            PATH: ${path.relative(directory, skippedPath.path)}
            STAGE: ${skippedPath.stage}
            MESSAGE: ${skippedPath.message}
            ${skippedPath.code ? `CODE: ${skippedPath.code}`: ''} 
        `)}`;
    const report = `
    Scanned ${(totalFilesScanned).toLocaleString()} files in ${directory}
    ${duplicatesFound ? duplicateString : noDuplicateString}
    ${verbose ? `${verboseString}` : `${skippedPaths === 0 ? '' : `⚠ ${skippedPaths} paths could not be read (run with --verbose to list them)`}`}
    `;
    return report;
}