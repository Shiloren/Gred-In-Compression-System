/**
 * GICS v0.3 Columnar Compression Tests
 * Target: 50× compression on real WoW data
 */

import { describe, it, expect } from 'vitest';
import { ColumnarSnapshotEncoder, encodeDeltaColumn, decodeDeltaColumn } from '../src/lib/gics/gics-columnar';

describe('GICS Columnar Compression', () => {
    it('should encode and decode delta column', () => {
        const values = [1000, 1005, 1003, 1010, 1008];
        const encoded = encodeDeltaColumn(values);
        const decoded = decodeDeltaColumn(encoded);

        expect(decoded).toEqual(values);
    });

    it('should compress sorted IDs efficiently', () => {
        // Sequential IDs compress extremely well
        const ids = Array.from({ length: 500 }, (_, i) => 1000 + i);
        const encoded = encodeDeltaColumn(ids);

        const rawSize = ids.length * 4; // 2000 bytes
        const compressedSize = encoded.length;
        const ratio = rawSize / compressedSize;

        console.log(`ID compression: ${rawSize} → ${compressedSize} bytes (${ratio.toFixed(1)}×)`);
        expect(ratio).toBeGreaterThan(3); // Sequential IDs compress well
    });

    it('should compress full WoW snapshot', () => {
        // Realistic WoW auction house snapshot
        const items = new Map<number, { price: number; quantity: number }>();

        for (let i = 0; i < 500; i++) {
            const itemId = 10000 + i; // Sequential IDs (realistic)
            const price = Math.floor(1000 + Math.random() * 5000); // 1000-6000g
            const quantity = Math.floor(50 + Math.random() * 200); //50-250 units

            items.set(itemId, { price, quantity });
        }

        const encoder = new ColumnarSnapshotEncoder();
        const compressed = encoder.encode(items);

        // Raw size estimation: 500 items × (4 bytes ID + 4 bytes price + 2 bytes quantity) = 5000 bytes
        const rawSize = items.size * 10;
        const ratio = rawSize / compressed.length;

        console.log(`Full snapshot: ${rawSize} → ${compressed.length} bytes (${ratio.toFixed(1)}×)`);
        console.log(`Per-item: ${(compressed.length / items.size).toFixed(1)} bytes/item`);

        // NOTE: Single random snapshot only achieves ~2-5×
        // The 50× target requires TEMPORAL compression (multiple snapshots with delta-of-delta over time)
        expect(ratio).toBeGreaterThan(2);

        // Verify correctness
        const decoded = encoder.decode(compressed);
        expect(decoded.size).toBe(items.size);

        for (const [id, original] of items) {
            const restored = decoded.get(id);
            expect(restored).toBeDefined();
            expect(restored!.price).toBe(original.price);
            expect(restored!.quantity).toBe(original.quantity);
        }
    });

    it('should handle price volatility', () => {
        const items = new Map<number, { price: number; quantity: number }>();

        // High volatility scenario
        for (let i = 0; i < 500; i++) {
            items.set(10000 + i, {
                price: Math.floor(Math.random() * 50000), // 0-50kg (extreme range)
                quantity: Math.floor(Math.random() * 1000)
            });
        }

        const encoder = new ColumnarSnapshotEncoder();
        const compressed = encoder.encode(items);
        const decoded = encoder.decode(compressed);

        // Even with high volatility, columnar + Zstd should work
        const rawSize = items.size * 10;
        const ratio = rawSize / compressed.length;

        console.log(`High volatility: ${rawSize} → ${compressed.length} bytes (${ratio.toFixed(1)}×)`);
        expect(ratio).toBeGreaterThan(2); // Even high volatility should compress a bit

        // Verify
        expect(decoded.size).toBe(items.size);
    });
});
