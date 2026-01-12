/**
 * GICS Utilities
 * 
 * @module gics
 * @version 1.1.0
 * @status FROZEN - Canonical implementation
 * @see docs/GICS_V1.1_SPEC.md
 * 
 * Shared functions for GICS encoding/decoding.
 */

/**
 * Encode integers with zigzag + variable-length encoding
 * Small numbers = 1 byte, larger = 2-5 bytes
 */
export function encodeVarint(values: number[]): Uint8Array {
    const buffer: number[] = [];

    for (const val of values) {
        // Zigzag encode: map signed to unsigned (negative numbers close to 0)
        const zigzag = val >= 0 ? val * 2 : (val * -2) - 1;

        // Variable-length encoding
        let n = zigzag;
        while (n >= 0x80) {
            buffer.push((n & 0x7F) | 0x80);
            n >>>= 7;
        }
        buffer.push(n);
    }

    return new Uint8Array(buffer);
}

/**
 * Decode zigzag + variable-length integers
 */
export function decodeVarint(data: Uint8Array): number[] {
    const values: number[] = [];
    let i = 0;

    while (i < data.length) {
        let zigzag = 0;
        let shift = 0;

        while (i < data.length) {
            const byte = data[i++];
            zigzag |= (byte & 0x7F) << shift;
            if ((byte & 0x80) === 0) break;
            shift += 7;
        }

        // Decode zigzag
        const val = (zigzag >>> 1) ^ -(zigzag & 1);
        values.push(val);
    }

    return values;
}

/**
 * RLE + Varint encoding: extremely efficient for sparse data with many zeros
 * Format: [run_length][value][run_length][value]...
 * - Run of zeros: encode as [count, 0]
 * - Run of same value: encode as [count, value]
 * - Single values: encode as [1, value]
 */
export function encodeRLE(values: number[]): Uint8Array {
    if (values.length === 0) return new Uint8Array(0);

    const runs: number[] = [];
    let i = 0;

    while (i < values.length) {
        const val = values[i];
        let count = 1;

        // Count consecutive identical values
        while (i + count < values.length && values[i + count] === val && count < 255) {
            count++;
        }

        runs.push(count, val);
        i += count;
    }

    return encodeVarint(runs);
}

/**
 * Decode RLE + Varint
 */
export function decodeRLE(data: Uint8Array): number[] {
    const runs = decodeVarint(data);
    const values: number[] = [];

    // Guard: RLE runs must be pairs (count, value)
    if (runs.length % 2 !== 0) {
        console.warn('[GICS] decodeRLE: odd run count, data may be corrupted');
        // Process available pairs only
    }

    const pairCount = Math.floor(runs.length / 2);
    for (let i = 0; i < pairCount; i++) {
        const count = runs[i * 2];
        const val = runs[i * 2 + 1];
        for (let j = 0; j < count; j++) {
            values.push(val);
        }
    }

    return values;
}

/**
 * Wait for N ms
 */
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Format bytes to readable string
 */
export function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}