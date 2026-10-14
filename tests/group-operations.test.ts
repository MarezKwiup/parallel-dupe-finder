import { describe, it, expect } from "vitest";
import {
  getCandidateFiles,
  findDuplicateGroups,
} from "../src/scanner/group-operations";
import { type HashResult } from "../src/hashing/hash-service";

describe("getCandidateFiles", () => {
    it("should return files from groups containing multiple files", () => {
        const groups = new Map<number, string[]>([
            [100, ["/files/a.txt", "/files/b.txt"]],
            [200, ["/files/c.txt"]],
            [300, ["/files/d.txt", "/files/e.txt"]]
        ]);

        const result = getCandidateFiles(groups);

        expect(result).toHaveLength(4);
        expect(result).toEqual([
            "/files/a.txt",
            "/files/b.txt",
            "/files/d.txt",
            "/files/e.txt"
        ])
    })

    it("should return an empty array when no groups contain duplicates", () => {
        const groups = new Map<number, string[]>([
            [100, ["/files/a.txt"]],
            [200, ["/files/b.txt"]]
        ]);

        expect(getCandidateFiles(groups)).toEqual([]);
    })

    it ("should handle an empty map", () => {
        expect(getCandidateFiles(new Map())).toEqual([]);
    })
})

describe("findDuplicateGroups", () => {
    it("should group files with identical hashes", () => {
        const results: HashResult[] = [
            {
                filePath: "/files/a.txt",
                hash: "abc123"
            },
            {
                filePath: "/files/b.txt",
                hash: "abc123"
            },
            {
                filePath: "/files/c.txt",
                hash: "xyz789"
            }
        ]

        expect(findDuplicateGroups(results)).toEqual([
            {
                hash: "abc123",
                files: ["/files/a.txt", "/files/b.txt"]
            }
        ])
    });

    it("should exclude hashes belonging to only one file", () => {
        const results: HashResult[] = [
            { filePath: "/files/a.txt", hash: "hash1" },
            { filePath: "/files/b.txt", hash: "hash2" }
        ];

        expect(findDuplicateGroups(results)).toEqual([]);
    });

    it("should handle three or more files with the same hash", () => {
        const results: HashResult[] = [
            { filePath: "/files/a.txt", hash: "same" },
            { filePath: "/files/b.txt", hash: "same" },
            { filePath: "/files/c.txt", hash: "same" }
        ]

        expect(findDuplicateGroups(results)).toEqual([
            {
                hash: "same",
                files: [
                    "/files/a.txt",
                    "/files/b.txt",
                    "/files/c.txt"
                ]
            }
        ]);
    });

    it("should handle an empty array", () => {
        expect(findDuplicateGroups([])).toEqual([]);
    })
})