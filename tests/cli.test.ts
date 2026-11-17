import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const cli = path.resolve("src/cli/index.ts");

// Runs the real CLI in a child process and returns its output and exit code,
// instead of throwing when the exit code is not 0.
async function runCli(args: string[]) {
    try {
        const { stdout, stderr } = await execFileAsync(process.execPath, ["--import", "tsx", cli, ...args]);
        return { code: 0, stdout, stderr };
    } catch (err) {
        const e = err as { code: number; stdout: string; stderr: string };
        return { code: e.code, stdout: e.stdout, stderr: e.stderr };
    }
}

describe("CLI", () => {
    it("prints the scan result as JSON", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "dupe-finder-"));

        try {
            await writeFile(path.join(tempDir, "a.txt"), "same content");
            await writeFile(path.join(tempDir, "b.txt"), "same content");
            await writeFile(path.join(tempDir, "c.txt"), "different");

            const { code, stdout } = await runCli([tempDir, "--json", "--workers", "1"]);

            expect(code).toBe(0);

            const result = JSON.parse(stdout);
            expect(result.summary.totalFilesScanned).toBe(3);
            expect(result.summary.duplicateGroups).toBe(1);
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    }, 15_000);

    it("exits with code 1 and explains invalid arguments", async () => {
        const { code, stdout, stderr } = await runCli(["--workers", "0"]);

        expect(code).toBe(1);
        expect(stderr).toContain("--workers");
        expect(stderr).toContain("--help");
        expect(stdout).toBe("");
    }, 15_000);

    it("exits with code 1 when the directory does not exist", async () => {
        const { code, stderr } = await runCli(["/does/not/exist", "--workers", "1"]);

        expect(code).toBe(1);
        expect(stderr).toContain("ENOENT");
    }, 15_000);

    it("prints the version from package.json", async () => {
        const { code, stdout } = await runCli(["--version"]);

        expect(code).toBe(0);
        expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    }, 15_000);
});