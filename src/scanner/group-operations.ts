import { stat } from "node:fs/promises";
import { HashResult } from "../hashing/hash-service";
import type { SkippedEntry, DuplicateGroup } from "../types";

export async function groupFilesBySize(
    files: string[],
    minSize: number = 0
): Promise<{groups: Map<number, string[]>; skipped: SkippedEntry[]; sizes: Map<string, number>}> {
    const groups: Map<number, string[]> = new Map();
    const skipped: SkippedEntry[] = [];
    const sizes: Map<string, number> = new Map();
    const results = await Promise.allSettled(
        files.map(file => stat(file))
    );
    for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
            const size = result.value.size;

            if (size < minSize) continue;

            if (groups.has(size)) {
                groups.get(size)!.push(files[index]);
            } else {
                groups.set(size, [files[index]]);
            }
            sizes.set(files[index], size);
        } else {
            const e = result.reason as NodeJS.ErrnoException;
            skipped.push({
                path: files[index],
                stage: 'stat',
                code: e.code,
                message: e.message
            })
        }
    }
    return { groups, skipped, sizes };
}

export function getCandidateFiles(
    groups: Map<number, string[]>
): string [] {
    let candidates: string[] = [];
    for (const [size, files] of groups) {
        if (files.length > 1) {
            candidates.push(...files);
        }
    }
    return candidates;
}

export function findDuplicateGroups(
    results: HashResult[]
): DuplicateGroup[] {
    const hashMap: Map<string, string[]> = new Map();
    for (let i = 0; i < results.length; i++) {
        const hash = results[i].hash;
        const file = results[i].filePath;
        if (!hashMap.has(hash)) hashMap.set(hash, []);
        hashMap.get(hash)?.push(file);
    }
    const duplicateGroups: DuplicateGroup[] = [];
    for (const [hash, files] of hashMap) {
        if (files.length > 1) {
            duplicateGroups.push({ hash, files});
        }
    }
    return duplicateGroups;
}
