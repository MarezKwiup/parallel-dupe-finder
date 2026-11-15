
export type SkippedEntry = {
    path: string;
    stage: "scan" | "stat" | "hash";
    code?: string;
    message: string;
}

export type ScanResult = {
    summary: ScanSummary;
    duplicates: DuplicateGroup[];
    skipped: SkippedEntry[];
}

export type ScanSummary = {
    totalFilesScanned: number;
    candidateFiles: number;
    duplicateGroups: number;
    duplicateFiles: number;
    redundantFiles: number;
    reclaimableBytes: number;
    skippedPaths: number;
}

export type DuplicateGroup = {
    hash: string;
    files: string[];
}

export type ScanOptions = {
    workers?: number;
    minSize?: number;
    exclude?: string[];
}