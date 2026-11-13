import { readdir } from "node:fs/promises"
import path from "node:path";
import type { SkippedEntry } from "../duplicate-scanner";

export async function scanDirectory(directory: string): Promise<{ allFiles: string[]; skipped: SkippedEntry[] }> {
    const allFiles: string[] = [];
    const skipped: SkippedEntry[] = [];
    const root = path.resolve(directory);
    const directories = [root];

    while (directories.length > 0) {
        const currentDirectory = directories.pop()!;
        let entries;

        try {
            entries = await readdir(currentDirectory, {
                withFileTypes: true
            });
        } catch (err) {
            if (currentDirectory === root) {
                throw err;
            }
            const e = err as NodeJS.ErrnoException;
            skipped.push({
                path: currentDirectory,
                stage: 'scan',
                message: e.message,
                code: e.code
            })

        }

        for (const entry of entries!) {
            const fullPath = path.join(currentDirectory, entry.name);

            if (entry.isDirectory()) {
                directories.push(fullPath);
            } else if (entry.isFile()) {
                allFiles.push(fullPath);
            }
        }
    
    }

    return { allFiles, skipped };
}