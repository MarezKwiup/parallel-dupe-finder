import { readdir } from "node:fs/promises"
import path from "node:path";
import type { SkippedEntry } from "../duplicate-scanner";

export async function scanDirectory(directory: string): Promise<{ allFiles: string[]; skipped: SkippedEntry[] }> {
    let allFiles: string[] = [];
    let skipped: SkippedEntry[] = [];
    const directories = [path.resolve(directory)];

    while (directories.length > 0) {
        const currentDirectory = directories.pop()!;

        try {
            const entries = await readdir(currentDirectory, {
                withFileTypes: true
            });

            for (const entry of entries) {
                const fullPath = path.join(currentDirectory, entry.name);

                if (entry.isDirectory()) {
                    directories.push(fullPath);
                } else if (entry.isFile()) {
                    allFiles.push(fullPath);
                }
            }
        } catch {
            if (currentDirectory === directory) {
                throw new Error("Unable to scan root directory");
            }
            skipped.push({
                path: currentDirectory,
                stage: 'scan',
                message: 'Unable to scan directory'
            })

        }
    }

    return { allFiles, skipped };
}