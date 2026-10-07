import { readdir } from "node:fs/promises"
import path from "node:path";

export async function scanDirectory(directory: string): Promise<string[]> {
    let allFiles: string[] = [];
    const directories = [path.resolve(directory)];

    while (directories.length > 0) {
        const currentDirectory = directories.pop()!;

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
    }

    return allFiles;
}