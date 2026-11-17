const UNITS = ["B", "KB", "MB", "GB"] as const;
const BASE = 1024;

const MULTIPLIERS: Record<string, number> = {
    b: 1,
    kb: BASE,
    mb: BASE ** 2,
    gb: BASE ** 3,
};

export function parseSize(input: string): number {
    const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);

    if (!match) {
        throw new Error(`Invalid size: "${input}"`);
    }

    const value = parseFloat(match[1]);
    const unit = (match[2] ?? "b").toLowerCase();

    return Math.floor(value * MULTIPLIERS[unit]);
}

export function formatBytes(bytes: number): string {
    let value = bytes;
    let unitIndex = 0;

    while (value >= BASE && unitIndex < UNITS.length - 1) {
        value /= BASE;
        unitIndex++;
    }

    let rounded = Math.round(value * 10) / 10;

    if (rounded >= BASE && unitIndex < UNITS.length - 1) {
        rounded = Math.round((rounded / BASE) * 10) / 10;
        unitIndex++;
    }

    return `${rounded} ${UNITS[unitIndex]}`;
}