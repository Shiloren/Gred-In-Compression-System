
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { gics11_encode, gics11_decode } from '../gics_frozen/v1_1_0/index.js';
import type { Snapshot } from '../gics_frozen/v1_1_0/gics-types.js';

// ============================================================================
// Deterministic Generators (Frozen from bench/scripts/datasets.ts)
// ============================================================================

class RNG {
    private s: number;
    constructor(seed: number) { this.s = seed; }
    next(): number {
        this.s = (this.s + 0x9e3779b9) | 0;
        let t = Math.imul(this.s ^ (this.s >>> 16), 0x21f0aaad);
        t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
        return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
    }
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

function generateTrendInt(rows: number, seed: number): { t: number, v: number }[] {
    const rng = new RNG(seed);
    const data: { t: number, v: number }[] = [];
    let current = 1000;
    for (let i = 0; i < rows; i++) {
        const delta = rng.nextInt(-1, 5);
        current += delta;
        data.push({ t: i, v: current });
    }
    return data;
}

function generateVolatileInt(rows: number, seed: number): { t: number, v: number }[] {
    const rng = new RNG(seed);
    const data: { t: number, v: number }[] = [];
    let current = 1000;
    for (let i = 0; i < rows; i++) {
        const delta = rng.nextInt(-100, 100);
        current += delta;
        data.push({ t: i, v: current });
    }
    return data;
}

function adaptToSnapshots(data: { t: number, v: number }[]): Snapshot[] {
    return data.map(row => ({
        timestamp: row.t,
        items: new Map([[1, { price: row.v, quantity: 1 }]])
    }));
}

function computeSha256(buffer: Uint8Array): string {
    return createHash('sha256').update(buffer).digest('hex');
}

// ============================================================================
// Golden Tests
// ============================================================================

describe('GICS v1.1 Immutable Snapshot (Golden Verified)', () => {

    it('TS_TREND_INT: Should match golden hash', async () => {
        const raw = generateTrendInt(1000, 12345);
        const snapshots = adaptToSnapshots(raw);

        const encoded = await gics11_encode(snapshots);
        const checksum = computeSha256(encoded);

        console.log('TS_TREND_INT Hash:', checksum);
        console.log('TS_TREND_INT Length:', encoded.length);

        const fs = await import('node:fs');
        fs.writeFileSync('hash_trend.txt', checksum);
        fs.writeFileSync('len_trend.txt', encoded.length.toString());

        // Header Structure Checks (GICS v1)
        // Magic (4) + Version (1) + Flags (1)
        expect(encoded[0]).toBe(0x47); // G
        expect(encoded[1]).toBe(0x49); // I
        expect(encoded[2]).toBe(0x43); // C
        expect(encoded[3]).toBe(0x53); // S
        expect(encoded[4]).toBe(1);    // Version 1

        // Roundtrip check
        const decoded = await gics11_decode(encoded);
        expect(decoded.length).toBe(snapshots.length);
        expect(decoded[0].items.get(1)?.price).toBe(snapshots[0].items.get(1)?.price);

        // Exact Length Verification
        expect(encoded.length).toBe(990);

        // SHA256 Verification
        expect(checksum).toBe('14c7c7a2f5999d6f5753b02e56779492b4ec5369bf9641045a1455caa94f9b1f');
    });

    it('TS_VOLATILE_INT: Should match golden hash', async () => {
        const raw = generateVolatileInt(1000, 67890);
        const snapshots = adaptToSnapshots(raw);

        const encoded = await gics11_encode(snapshots);
        const checksum = computeSha256(encoded);

        console.log('TS_VOLATILE_INT Hash:', checksum);
        console.log('TS_VOLATILE_INT Length:', encoded.length);

        const fs = await import('node:fs');
        fs.writeFileSync('hash_volatile.txt', checksum);
        fs.writeFileSync('len_volatile.txt', encoded.length.toString());

        // Header Structure Checks
        expect(encoded[0]).toBe(0x47);
        expect(encoded[4]).toBe(1);

        // Roundtrip check
        const decoded = await gics11_decode(encoded);
        expect(decoded.length).toBe(snapshots.length);

        // Exact Length Verification
        expect(encoded.length).toBe(1678);

        // SHA256 Verification
        expect(checksum).toBe('5c22f135c27917cf1decbe9a4924efed9869214c78dae5a95b812dbf436ac8bd');
    });

    it('TS_TREND_INT_LARGE (Reduced): Should match golden hash', async () => {
        // Reduced size for CI to 10k rows
        const raw = generateTrendInt(10000, 11111);
        const snapshots = adaptToSnapshots(raw);

        const encoded = await gics11_encode(snapshots);
        const checksum = computeSha256(encoded);

        console.log('TS_TREND_INT_LARGE Hash:', checksum);
        console.log('TS_TREND_INT_LARGE Length:', encoded.length);

        const fs = await import('node:fs');
        fs.writeFileSync('hash_large.txt', checksum);
        fs.writeFileSync('len_large.txt', encoded.length.toString());

        // Header Checks
        expect(encoded[0]).toBe(0x47);
        expect(encoded[4]).toBe(1);

        // Roundtrip check
        const decoded = await gics11_decode(encoded);
        expect(decoded.length).toBe(snapshots.length);

        // Exact Length Verification
        expect(encoded.length).toBe(9786);

        expect(checksum).toBe('0758d37f9b794601c26e16d9bb783d36766ebe5f9737b9353c8e347790fbcd19');
    });

});
