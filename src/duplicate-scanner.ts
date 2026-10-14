import { HashService } from "./hashing/hash-service";
import { scanDirectory } from "./scanner/directory-scanner";
import { DuplicateGroup, findDuplicateGroups, getCandidateFiles, groupFilesBySize } from "./scanner/group-operations";
import fs from 'node:fs/promises';

export type ScanSummary = {
    totalFilesScanned: number;
    candidateFiles: number;
    duplicateGroups: number;
    duplicateFiles: number;
    redundantFiles: number;
    reclaimableBytes: number;
}

export type ScanResult = {
    summary: ScanSummary;
    duplicates: DuplicateGroup[];
}

export class DuplicateScanner {
    private hashService : HashService;

    constructor(workerCount: number) {
        this.hashService = new HashService(workerCount);
    }

    async scan(directory: string): Promise<ScanResult> {
        const files = await scanDirectory(directory);
        const groups = await groupFilesBySize(files);
        const candidateFiles = getCandidateFiles(groups);
        const candidateHashes = await this.hashService.hashFiles(candidateFiles);
        const duplicateHashes = findDuplicateGroups(candidateHashes);
        const sizes = await Promise.all(
            duplicateHashes.map((group) => fs.stat(group.files[0]).then(s => s.size))
        )
        const {
            duplicateFiles,
            redundantFiles,
            reclaimableBytes
        } = duplicateHashes.reduce((acc, group, i) => {
            const extra = group.files.length - 1;
            return {
                duplicateFiles: acc.duplicateFiles + group.files.length,
                redundantFiles: acc.redundantFiles + extra,
                reclaimableBytes: acc.reclaimableBytes + extra * sizes[i]
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
                reclaimableBytes
            },
            duplicates: duplicateHashes
        }
        return result;
    }

    async shutdown(): Promise<void> {
        await this.hashService.shutdown();
    }
}