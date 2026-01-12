/**
 * GICS v0.3 Columnar Delta Encoder
 * Target: 50× compression on WoW auction data
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { compress, decompress } from '@mongodb-js/zstd';

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

    for (let i = 0; i < runs.length; i += 2) {
        const count = runs[i];
        const val = runs[i + 1];
        for (let j = 0; j < count; j++) {
            values.push(val);
        }
    }

    return values;
}
/**
 * Delta encode a column of numbers
 */
export function encodeDeltaColumn(values: number[]): Uint8Array {
    if (values.length === 0) return new Uint8Array(0);

    const deltas: number[] = [values[0]]; // Store first value as base

    for (let i = 1; i < values.length; i++) {
        deltas.push(values[i] - values[i - 1]);
    }

    return encodeVarint(deltas);
}

/**
 * Decode delta-encoded column
 */
export function decodeDeltaColumn(data: Uint8Array): number[] {
    const deltas = decodeVarint(data);
    if (deltas.length === 0) return [];

    const values: number[] = [deltas[0]];

    for (let i = 1; i < deltas.length; i++) {
        values.push(values[i - 1] + deltas[i]);
    }

    return values;
}

/**
 * Columnar snapshot encoder
 */
export class ColumnarSnapshotEncoder {
    /**
     * Encode snapshot into compressed columnar format
     */
    /**
     * Encode snapshot into compressed columnar format (Sync - Zlib)
     */
    encode(items: Map<number, { price: number; quantity: number }>): Uint8Array {
        // Sort by ID for better compression
        const sorted = Array.from(items.entries()).sort((a, b) => a[0] - b[0]);

        // Extract columns
        const ids = sorted.map(([id]) => id);
        const prices = sorted.map(([_, v]) => Math.floor(v.price)); // Prices as integers (copper)
        const quantities = sorted.map(([_, v]) => v.quantity);

        // Delta encode each column
        const idsEncoded = encodeDeltaColumn(ids);
        const pricesEncoded = encodeDeltaColumn(prices);
        const quantitiesEncoded = encodeDeltaColumn(quantities);

        // Compress each column with zlib (level 9 = max compression)
        const idsCompressed = deflateSync(Buffer.from(idsEncoded), { level: 9 });
        const pricesCompressed = deflateSync(Buffer.from(pricesEncoded), { level: 9 });
        const quantitiesCompressed = deflateSync(Buffer.from(quantitiesEncoded), { level: 9 });

        // Build final buffer with lengths
        const header = new Uint8Array(12);
        const view = new DataView(header.buffer);
        view.setUint32(0, idsCompressed.length, true);
        view.setUint32(4, pricesCompressed.length, true);
        view.setUint32(8, quantitiesCompressed.length, true);

        // Concatenate
        const total = header.length + idsCompressed.length + pricesCompressed.length + quantitiesCompressed.length;
        const result = new Uint8Array(total);
        let offset = 0;

        result.set(header, offset); offset += header.length;
        result.set(idsCompressed, offset); offset += idsCompressed.length;
        result.set(pricesCompressed, offset); offset += pricesCompressed.length;
        result.set(quantitiesCompressed, offset);

        return result;
    }

    /**
     * Encode snapshot into compressed columnar format (Async - Zstd)
     */
    async encodeAsync(items: Map<number, { price: number; quantity: number }>, compressionLevel: number = 10): Promise<Uint8Array> {
        const sorted = Array.from(items.entries()).sort((a, b) => a[0] - b[0]);

        const ids = sorted.map(([id]) => id);
        const prices = sorted.map(([_, v]) => Math.floor(v.price));
        const quantities = sorted.map(([_, v]) => v.quantity);

        const idsEncoded = encodeDeltaColumn(ids);
        const pricesEncoded = encodeDeltaColumn(prices);
        const quantitiesEncoded = encodeDeltaColumn(quantities);

        // Zstd level (configurable, default 10)
        const [idsCompressed, pricesCompressed, quantitiesCompressed] = await Promise.all([
            compress(Buffer.from(idsEncoded), compressionLevel),
            compress(Buffer.from(pricesEncoded), compressionLevel),
            compress(Buffer.from(quantitiesEncoded), compressionLevel)
        ]);

        const header = new Uint8Array(12);
        const view = new DataView(header.buffer);
        view.setUint32(0, idsCompressed.length, true);
        view.setUint32(4, pricesCompressed.length, true);
        view.setUint32(8, quantitiesCompressed.length, true);

        const total = header.length + idsCompressed.length + pricesCompressed.length + quantitiesCompressed.length;
        const result = new Uint8Array(total);
        let offset = 0;

        result.set(header, offset); offset += header.length;
        result.set(idsCompressed, offset); offset += idsCompressed.length;
        result.set(pricesCompressed, offset); offset += pricesCompressed.length;
        result.set(quantitiesCompressed, offset);

        return result;
    }

    /**
     * Decode columnar snapshot back to Map
     */
    decode(data: Uint8Array): Map<number, { price: number; quantity: number }> {
        const view = new DataView(data.buffer, data.byteOffset);

        // Read lengths
        const idsLen = view.getUint32(0, true);
        const pricesLen = view.getUint32(4, true);
        const quantitiesLen = view.getUint32(8, true);

        let offset = 12;

        // Extract compressed columns
        const idsCompressed = data.slice(offset, offset + idsLen); offset += idsLen;
        const pricesCompressed = data.slice(offset, offset + pricesLen); offset += pricesLen;
        const quantitiesCompressed = data.slice(offset, offset + quantitiesLen);

        // Decompress
        const idsEncoded = new Uint8Array(inflateSync(idsCompressed));
        const pricesEncoded = new Uint8Array(inflateSync(pricesCompressed));
        const quantitiesEncoded = new Uint8Array(inflateSync(quantitiesCompressed));

        // Decode deltas
        const ids = decodeDeltaColumn(idsEncoded);
        const prices = decodeDeltaColumn(pricesEncoded);
        const quantities = decodeDeltaColumn(quantitiesEncoded);

        // Reconstruct map
        const items = new Map<number, { price: number; quantity: number }>();
        for (let i = 0; i < ids.length; i++) {
            items.set(ids[i], {
                price: prices[i],
                quantity: quantities[i]
            });
        }

        return items;
    }

    /**
     * Decode columnar snapshot back to Map (Async - Zstd)
     */
    async decodeAsync(data: Uint8Array): Promise<Map<number, { price: number; quantity: number }>> {
        const view = new DataView(data.buffer, data.byteOffset);

        const idsLen = view.getUint32(0, true);
        const pricesLen = view.getUint32(4, true);
        const quantitiesLen = view.getUint32(8, true);

        let offset = 12;

        const idsCompressed = data.slice(offset, offset + idsLen); offset += idsLen;
        const pricesCompressed = data.slice(offset, offset + pricesLen); offset += pricesLen;
        const quantitiesCompressed = data.slice(offset, offset + quantitiesLen);

        const [idsEncodedBuf, pricesEncodedBuf, quantitiesEncodedBuf] = await Promise.all([
            decompress(Buffer.from(idsCompressed)),
            decompress(Buffer.from(pricesCompressed)),
            decompress(Buffer.from(quantitiesCompressed))
        ]);

        const idsEncoded = new Uint8Array(idsEncodedBuf);
        const pricesEncoded = new Uint8Array(pricesEncodedBuf);
        const quantitiesEncoded = new Uint8Array(quantitiesEncodedBuf);

        const ids = decodeDeltaColumn(idsEncoded);
        const prices = decodeDeltaColumn(pricesEncoded);
        const quantities = decodeDeltaColumn(quantitiesEncoded);

        const items = new Map<number, { price: number; quantity: number }>();
        for (let i = 0; i < ids.length; i++) {
            items.set(ids[i], {
                price: prices[i],
                quantity: quantities[i]
            });
        }

        return items;
    }
}
