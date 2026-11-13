import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { scanDirectory } from "../src/scanner/directory-scanner";

const permissionUnsupported =
    process.platform === "win32" || process.getuid?.() === 0;

describe("scanDirectory", () => {
    it.skipIf(permissionUnsupported)(
        "should skip an unreadable subdirectory and keep scanning",
        async () => {
            const tempDir = await mkdtemp(path.join(os.tmpdir(), "dupe-finder-"));
            const lockedDir = path.join(tempDir, "locked");

            try {
                await writeFile(path.join(tempDir, "visible.txt"), "hello");
                await mkdir(lockedDir);

                // Remove permissions
                await chmod(lockedDir, 0o000);

                const { allFiles, skipped } = await scanDirectory(tempDir);

                expect(allFiles).toEqual([path.join(tempDir, "visible.txt")]);

                expect(skipped).toHaveLength(1);
                expect(skipped[0]).toMatchObject({
                    path: lockedDir,
                    stage: "scan",
                    code: "EACCES"
                })
            } finally {
                // Restore permissions
                await chmod(lockedDir, 0o755).catch(() => {});
                await rm(tempDir, { recursive: true, force: true });
            }
        }
    );

    it("should throw when the root directory does not exist", async () => {
        await expect(scanDirectory("does/not/exist")).rejects.toMatchObject({
            code: "ENOENT"
        });
    });
});