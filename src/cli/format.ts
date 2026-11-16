import { bytes } from "node:stream/consumers";

export const parseSize = (input: string): number => {
    const regex = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i;
    const match = input.trim().match(regex);

    if (!match) {
        throw new Error(`Invalid size format: ${input}`);
    }

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'b').toLowerCase();

    const multipliers = {
        b: 1,
        kb: 1024,
        mb: 1024 * 1024,
        gb: 1024 * 1024 * 1024
    };

    return Math.floor(value * multipliers[unit as keyof typeof multipliers]);
}

export const formatBytes = (bytes: number): string => {
    const multipliers = {
        b: 1,
        kb: 1024,
        mb: 1024 * 1024,
        gb: 1024 * 1024 * 1024
    };
    if (bytes > multipliers["gb"]) {
        const val = parseFloat((bytes / multipliers["gb"]).toFixed(1));
        return `${val} GB`;
    } else if (bytes > multipliers["mb"]) {
        const val = parseFloat((bytes / multipliers["mb"]).toFixed(1));
        return `${val} MB`;
    } else if (bytes > multipliers["kb"]) {
        const val = parseFloat((bytes / multipliers["kb"]).toFixed(1));
        return `${val} KB`;
    }
    return `${bytes} B`;
}