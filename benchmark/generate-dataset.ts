import { mkdir, writeFile, copyFile, rm, readdir, access } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import os from "node:os";

const MB = 1024 * 1024;

// A file with this name marks a folder as created by this script
const MARKER = ".dupe-finder-bench";

const SIZES = Array.from({ length: 20 }, (_, i) => Math.round(MB + (i * 7 * MB ) / 19));

const DUPLICATE_RATIO = 0.25;

// mulberry32: a tiny seeded random number generator. The same seed always
// produces the same sequence, so the same seed always produces the same dataset.
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

async function exists(p: string): Promise<boolean> {
    try {
        await access(p);
        return true;
    } catch {
        return false;
    }
}

async function prepareOutputDir(outDir: string): Promise<void> {
    if (await exists(outDir)) {
        const entries = await readdir(outDir);
        const isOurs = entries.includes(MARKER);

        if (entries.length > 0 && !isOurs) {
            throw new Error(
                `${outDir} is not empty and was not created in this script.`
            );
        }

        await rm(outDir, { recursive: true, force: true });
    }

    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, MARKER), "");
}

function formatMB(bytes: number): string {
    return `${(bytes / MB).toFixed(0)} MB`;
}

async function main() {
    const { values } = parseArgs({
        options: {
            out: { type: "string", default: path.join(os.tmpdir(), "dupe-finder-bench") },
            files: { type: "string", default: "600" },
            seed: { type: "string", default: "42" },
        },
    });

    const outDir = path.resolve(values.out);
    const fileCount = Number(values.files);
    const seed = Number(values.seed);

    if (!Number.isInteger(fileCount) || fileCount <= 0) {
        throw new Error("--files must be a positive integer");
    }

    const random = mulberry32(seed);
    const started = performance.now();

    await prepareOutputDir(outDir);

    const filler = Buffer.alloc(MB);
    for (let i = 0; i < filler.length; i++) {
        filler[i] = Math.floor(random() * 256);
    };

    const originals: string[] = []; //unique file that copies are made from
    const copiesPerOriginal = new Map<string, number>();
    const sizeIndexOf = new Map<string, number>(); // size of each original
    let totalBytes = 0;
    let duplicateCopies = 0;

    for (let i = 0; i < fileCount; i++) {
        const dir = path.join(outDir, `group-${i % 8}`, `batch-${Math.floor(i / 50)}`);
        await mkdir(dir, { recursive: true });
        const filePath = path.join(dir, `file-${i}.bin`);

        const makeDuplicate = originals.length > 0 && random() < DUPLICATE_RATIO;

        if (makeDuplicate) {
            const source = originals[Math.floor(random() * originals.length)];
            await copyFile(source, filePath);

            copiesPerOriginal.set(source, (copiesPerOriginal.get(source) ?? 0) + 1);
            duplicateCopies++;
            totalBytes += SIZES[sizeIndexOf.get(source)!];
            continue;
        }

        const sizeIndex = Math.floor(random() * SIZES.length);
        const size = SIZES[sizeIndex];

        const content = Buffer.alloc(size);
        for (let offset = 0; offset < size; offset += filler.length) {
            filler.copy(content, offset, 0, Math.min(filler.length, size - offset));
        }
        content.write(`unique-file-${seed}-${i}\n`, 0);
        
        await writeFile(filePath, content);

        originals.push(filePath);
        sizeIndexOf.set(filePath, sizeIndex);
        totalBytes += size;
    }

    const duplicateGroups = copiesPerOriginal.size;
    const seconds = ((performance.now() - started) / 1000).toFixed(1);

    const manifest = {
        seed,
        files: fileCount,
        totalBytes,
        expected: {
            duplicateGroups,
            duplicateFiles: duplicateGroups + duplicateCopies,
            redundantFiles: duplicateCopies
        },
    };
    await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    console.log(`Dataset written to ${outDir} in ${seconds}s`);
    console.log(`Files: ${fileCount}`);
    console.log(`Total size: ${formatMB(totalBytes)}`);
    console.log(`Duplicate groups: ${duplicateGroups}`);
    console.log(`Redundant copies: ${duplicateCopies}`);
}

main().catch((err) => {
    console.error(`Error: ${(err as Error).message}`);
    process.exitCode = 1;
});