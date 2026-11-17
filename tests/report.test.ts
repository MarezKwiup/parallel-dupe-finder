import { describe, it, expect } from "vitest";
import path from "node:path";
import { formatReport } from "../src/cli/report.js";
import type { DuplicateGroup, ScanResult, SkippedEntry } from "../src/types.js";

const root = path.resolve("/scan/root");
const file = (name: string) => path.join(root, name);

// Builds a ScanResult by hand, so the report can be tested without running a scan.
// The summary is calculated from the groups, so the numbers always agree.
function makeResult(duplicates: DuplicateGroup[], skipped: SkippedEntry[] = []): ScanResult {
    const duplicateFiles = duplicates.reduce((sum, g) => sum + g.files.length, 0);
    const redundantFiles = duplicates.reduce((sum, g) => sum + g.files.length - 1, 0);
    const reclaimableBytes = duplicates.reduce(
        (sum, g) => sum + g.size * (g.files.length - 1),
        0
    );

    return {
        summary: {
            totalFilesScanned: 12_483,
            candidateFiles: duplicateFiles,
            duplicateGroups: duplicates.length,
            duplicateFiles,
            redundantFiles,
            reclaimableBytes,
            skippedPaths: skipped.length,
        },
        duplicates,
        skipped,
    };
}

// Small group listed FIRST on purpose: the report must reorder it.
const smallGroup: DuplicateGroup = {
    hash: "aaa",
    size: 1024, // 1 KB × 3 copies → 2 KB reclaimable
    files: [file("notes.txt"), file("backup/notes.txt"), file("old/notes.txt")],
};

const bigGroup: DuplicateGroup = {
    hash: "bbb",
    size: 5 * 1024 * 1024, // 5 MB × 2 copies → 5 MB reclaimable
    files: [file("video.mp4"), file("backup/video.mp4")],
};

const skippedEntries: SkippedEntry[] = [
    { path: file("locked"), stage: "scan", code: "EACCES", message: "permission denied" },
    { path: file("gone.txt"), stage: "stat", code: "ENOENT", message: "no such file" },
];

describe("formatReport", () => {
    it("shows the summary numbers", () => {
        const report = formatReport(makeResult([smallGroup, bigGroup]), root, false);

        expect(report).toContain("12,483");          // file count with separators
        expect(report).toContain("2 duplicate groups");
        expect(report).toContain("5 files");         // 3 + 2 duplicate files
        expect(report).toContain("5 MB");            // 5 MB + 2 KB, rounded
        expect(report).toContain("3 redundant");     // 2 + 1 extra copies
    });

    it("lists the group with the most reclaimable space first", () => {
        const report = formatReport(makeResult([smallGroup, bigGroup]), root, false);

        const bigIndex = report.indexOf("video.mp4");
        const smallIndex = report.indexOf("notes.txt");

        expect(bigIndex).toBeGreaterThan(-1);
        expect(smallIndex).toBeGreaterThan(-1);
        expect(bigIndex).toBeLessThan(smallIndex);
    });

    it("shows each group's size and reclaimable space", () => {
        const report = formatReport(makeResult([smallGroup]), root, false);

        expect(report).toContain("1 KB");  // size of each copy
        expect(report).toContain("2 KB");  // reclaimable: 1 KB × 2 extra copies
    });

    it("shows paths relative to the scanned folder", () => {
        const report = formatReport(makeResult([bigGroup]), root, false);

        expect(report).toContain(path.join("backup", "video.mp4"));
        expect(report).not.toContain(root + path.sep);
    });

    it("says so when there are no duplicates", () => {
        const report = formatReport(makeResult([]), root, false);

        expect(report).toContain("No duplicates found");
        expect(report).not.toContain("duplicate groups");
    });

    it("shows only a count of skipped paths by default", () => {
        const report = formatReport(makeResult([bigGroup], skippedEntries), root, false);

        expect(report).toContain("2 paths could not be read");
        expect(report).toContain("--verbose");
        expect(report).not.toContain("EACCES");
    });

    it("lists each skipped path with its code in verbose mode", () => {
        const report = formatReport(makeResult([bigGroup], skippedEntries), root, true);

        expect(report).toContain(file("locked"));
        expect(report).toContain("EACCES");
        expect(report).toContain(file("gone.txt"));
        expect(report).toContain("ENOENT");
    });

    it("does not mention skipped paths when there are none", () => {
        const report = formatReport(makeResult([bigGroup]), root, false);

        expect(report).not.toContain("could not be read");
    });
});