import { stat } from "node:fs/promises";
import { HashResult } from "../hashing/hash-service";
export async function groupFilesBySize(
    files: string[]
): Promise<Map<number, string[]>> {
    const group: Map<number, string[]> = new Map();
    for (const file of files) {
        const info = await stat(file);
        const size = info.size;
        if (group.has(size)) {
            group.get(size)!.push(file);
        } else {
            group.set(size, [file]);
        }
    }
    return group;
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

type DuplicateGroup = {
    hash: string;
    files: string[];
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
