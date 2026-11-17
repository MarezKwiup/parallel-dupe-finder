import { describe, it, expect } from "vitest";
import { parseSize, formatBytes } from "../src/cli/format.js";

describe("parseSize", () => {
    it.each([
        ["0", 0],
        ["500", 500],
        ["500b", 500],
        ["10kb", 10_240],
        ["1.5MB", 1_572_864],
        ["2gb", 2_147_483_648],
        ["1.1kb", 1126],     
        [" 10 kb ", 10_240], 
    ])("parseSize(%j) = %i", (input, expected) => {
        expect(parseSize(input)).toBe(expected);
    });

    it.each(["", "abc", "-5mb", "10tb", "1.5.5kb", "kb"])(
        "throws for invalid input %j",
        (input) => {
            expect(() => parseSize(input)).toThrow("Invalid size");
        }
    );
});

describe("formatBytes", () => {
    it.each([
        [0, "0 B"],
        [500, "500 B"],
        [1023, "1023 B"],
        [1024, "1 KB"],               
        [1536, "1.5 KB"],
        [1_048_575, "1 MB"],          
        [1_048_576, "1 MB"],
        [1_073_741_824, "1 GB"],
        [4_700_000_000, "4.4 GB"],
        [5 * 1024 ** 4, "5120 GB"],   
    ])("formatBytes(%i) = %j", (input, expected) => {
        expect(formatBytes(input)).toBe(expected);
    });
});