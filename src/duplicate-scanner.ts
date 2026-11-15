import { HashService } from "./hashing/hash-service";
import { scanDirectory } from "./scanner/directory-scanner";
import { findDuplicateGroups, getCandidateFiles, groupFilesBySize } from "./scanner/group-operations";
import type { DuplicateGroup, ScanResult  } from "./types";

export class DuplicateScanner {
    private hashService : HashService;

    constructor(workerCount: number) {
        this.hashService = new HashService(workerCount);
    }

    async scan(directory: string): Promise<ScanResult> {
        const { allFiles: files, skipped: scanSkipped } = await scanDirectory(directory);
        const { groups, skipped: statSkipped, sizes } = await groupFilesBySize(files);
        const candidateFiles = getCandidateFiles(groups);
        const { results: candidateHashes, skipped: hashSkipped } = await this.hashService.hashFiles(candidateFiles);
        const skipped = [ ...scanSkipped, ...statSkipped, ...hashSkipped];
        const duplicateHashes = findDuplicateGroups(candidateHashes);
        const {
            duplicateFiles,
            redundantFiles,
            reclaimableBytes
        } = duplicateHashes.reduce((acc, group) => {
            const extra = group.files.length - 1;
            return {
                duplicateFiles: acc.duplicateFiles + group.files.length,
                redundantFiles: acc.redundantFiles + extra,
                reclaimableBytes: acc.reclaimableBytes + extra * sizes.get(group.files[0])!
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
                duplicateGroups: duplicateHashes.length,
                duplicateFiles,
                redundantFiles,
                reclaimableBytes,
                skippedPaths: skipped.length
            },
            duplicates: duplicateHashes,
            skipped: skipped
        }
        return result;
    }

    async shutdown(): Promise<void> {
        await this.hashService.shutdown();
    }
}