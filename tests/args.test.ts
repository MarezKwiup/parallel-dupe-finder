import { describe, it, expect } from "vitest";
import { parseCliArgs, UsageError } from "../src/cli/args.js";
import { DEFAULT_EXCLUDE } from "../src/duplicate-scanner.js";

describe("parseCliArgs", () => {
    it("defaults to scanning the current directory", () => {
        expect(parseCliArgs([])).toEqual({
            kind: "scan",
            directory: ".",
            options: { exclude: [...DEFAULT_EXCLUDE] },
            json: false,
            verbose: false,
        });
    });

    it("parses every scan option", () => {
        const command = parseCliArgs([
            "./photos",
            "--workers", "4",
            "--min-size", "1mb",
            "--json",
            "--verbose",
        ]);

        expect(command).toEqual({
            kind: "scan",
            directory: "./photos",
            options: {
                workers: 4,
                minSize: 1_048_576,
                exclude: [...DEFAULT_EXCLUDE],
            },
            json: true,
            verbose: true,
        });
    });

    it("supports the -w short flag", () => {
        const command = parseCliArgs(["-w", "2"]);

        expect(command).toMatchObject({ kind: "scan", options: { workers: 2 } });
    });

    it("adds repeated --exclude values to the defaults", () => {
        const command = parseCliArgs(["--exclude", "build", "--exclude", ".cache"]);

        expect(command).toMatchObject({
            kind: "scan",
            options: { exclude: [...DEFAULT_EXCLUDE, "build", ".cache"] },
        });
    });

    it.each([["--help"], ["-h"]])("%s returns the help command", (flag) => {
        expect(parseCliArgs([flag])).toEqual({ kind: "help" });
    });

    it.each([["--version"], ["-v"]])("%s returns the version command", (flag) => {
        expect(parseCliArgs([flag])).toEqual({ kind: "version" });
    });

    it("lets --help win over other invalid arguments", () => {
        expect(parseCliArgs(["--workers", "0", "--help"])).toEqual({ kind: "help" });
    });

    it.each([
        ["an unknown flag", ["--wrokers", "4"]],
        ["a missing flag value", ["--workers"]],
        ["zero workers", ["--workers", "0"]],
        ["non-numeric workers", ["--workers", "abc"]],
        ["fractional workers", ["--workers", "1.5"]],
        ["an invalid size", ["--min-size", "xyz"]],
        ["two directories", ["./a", "./b"]],
    ])("throws a UsageError for %s", (_label, argv) => {
        expect(() => parseCliArgs(argv)).toThrow(UsageError);
    });

    it("names the flag in the error message", () => {
        expect(() => parseCliArgs(["--min-size", "xyz"])).toThrow(/--min-size/);
    });
});