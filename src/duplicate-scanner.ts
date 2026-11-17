import { group } from "node:console";
import { HashService } from "./hashing/hash-service.js";
import { scanDirectory } from "./scanner/directory-scanner.js";
import { findDuplicateGroups, getCandidateFiles, groupFilesBySize } from "./scanner/group-operations.js";
import type { DuplicateGroup, ScanOptions, ScanResult  } from "./types.js";
import os from "node:os"

export const DEFAULT_EXCLUDE: readonly string[] = ["node_modules", ".git"];

export class DuplicateScanner {
    private hashService : HashService;
    private readonly options: Required<ScanOptions>;

    constructor(options: ScanOptions = {}) {
        
        if (options.minSize !== undefined && !(Number.isInteger(options.minSize) && options.minSize >= 0)) {
            throw new RangeError("Min size must be a non-negative integer");
        }

        this.options = {
            workers: Math.max(1, os.availableParallelism() - 1),
            minSize: 1,
            exclude: [...DEFAULT_EXCLUDE],
            ...options
        };

        this.hashService = new HashService(this.options.workers);
    }

    async scan(directory: string): Promise<ScanResult> {
        const { allFiles: files, skipped: scanSkipped } = await scanDirectory(directory, this.options.exclude);
        const { groups, skipped: statSkipped, sizes } = await groupFilesBySize(files, this.options.minSize);
        const candidateFiles = getCandidateFiles(groups);
        const { results: candidateHashes, skipped: hashSkipped } = await this.hashService.hashFiles(candidateFiles);
        const skipped = [ ...scanSkipped, ...statSkipped, ...hashSkipped];
        const duplicateGroups = findDuplicateGroups(candidateHashes, sizes);
        const {
            duplicateFiles,
            redundantFiles,
            reclaimableBytes
        } = duplicateGroups.reduce((acc, group) => {
            const extra = group.files.length - 1;
            return {
                duplicateFiles: acc.duplicateFiles + group.files.length,
                redundantFiles: acc.redundantFiles + extra,
                reclaimableBytes: acc.reclaimableBytes + extra * group.size
            }
        }, {
            duplicateFiles: 0,
            redundantFiles: 0,
            reclaimableBytes: 0
        })

        const result = {
            summary: {
                totalFilesScanned: files.length,
                candidateFiles: candidateFiles.length,
                duplicateGroups: duplicateGroups.length,
                duplicateFiles,
                redundantFiles,
                reclaimableBytes,
                skippedPaths: skipped.length
            },
            duplicates: duplicateGroups,
            skipped: skipped
        }
        return result;
    }

    async shutdown(): Promise<void> {
        await this.hashService.shutdown();
    }
}