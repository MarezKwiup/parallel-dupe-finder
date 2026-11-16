import { it, expect } from "vitest";
import { parseSize, formatBytes } from "../src/cli/format.js";

it.each([
    ["500", 500],
    ["10kb", 10240],
    ["1.5MB", 1572864],
])("parseSize(%s) = %d", (input, expected) => {
    expect(parseSize(input)).toBe(expected);
});

it.each([
    [0, "0 B"],
    [1536, "1.5 KB"],
    [4_700_000_000, "4.4 GB"]
])("formatBytes(%s) = %d", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
});