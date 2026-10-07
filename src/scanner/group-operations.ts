import { stat } from "node:fs/promises";

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