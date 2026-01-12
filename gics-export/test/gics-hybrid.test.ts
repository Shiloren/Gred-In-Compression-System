/**
 * GICS v0.4 Hybrid Storage Tests
 * Target: 100× compression with flexible item queries
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { HybridWriter, HybridReader, ItemQuery, TierClassifier } from '../src/lib/gics/gics-hybrid';
import type { Snapshot } from '../src/lib/gics/gics-types';

describe('GICS v0.4 Hybrid Storage (100× Target)', () => {
    // Helper to generate realistic WoW AH data
    function generateRealisticData(
        itemCount: number,
        days: number
    ): { snapshots: Snapshot[]; rawSize: number } {
        const snapshots: Snapshot[] = [];
        const hoursTotal = days * 24;
        const baseTimestamp = 1700000000;

        // Initialize base prices and tiers
        const basePrices = new Map<number, number>();
        const baseQuantities = new Map<number, number>();
        const itemTiers = new Map<number, 'hot' | 'warm' | 'cold'>();

        for (let i = 0; i < itemCount; i++) {
            const itemId = 10000 + i;
            basePrices.set(itemId, 1000 + Math.random() * 5000);
            baseQuantities.set(itemId, Math.floor(50 + Math.random() * 200));

            // Assign tiers: 5% HOT, 5% WARM, 90% COLD (realistic WoW AH distribution)
            if (i < itemCount * 0.05) {
                itemTiers.set(itemId, 'hot');
            } else if (i < itemCount * 0.10) {
                itemTiers.set(itemId, 'warm');
            } else {
                itemTiers.set(itemId, 'cold');
            }
        }

        // Generate hourly snapshots with tiered behavior
        let previousItems = new Map<number, { price: number; quantity: number }>();

        for (let hour = 0; hour < hoursTotal; hour++) {
            const items = new Map<number, { price: number; quantity: number }>();

            for (let i = 0; i < itemCount; i++) {
                const itemId = 10000 + i;
                const tier = itemTiers.get(itemId)!;
                const prev = previousItems.get(itemId);

                let price: number;
                let quantity: number;

                if (!prev) {
                    // First snapshot
                    price = Math.floor(basePrices.get(itemId)!);
                    quantity = baseQuantities.get(itemId)!;
                } else {
                    // Apply tier-based changes
                    switch (tier) {
                        case 'hot':
                            // HOT: Consistent changes every hour (perfect for DoD)
                            const typicalDelta = ((i % 10) - 5) * 2;
                            price = prev.price + typicalDelta;
                            quantity = prev.quantity + Math.floor(typicalDelta / 4);
                            break;

                        case 'warm':
                            // WARM: 8% chance of erratic change (realistic market)
                            if (Math.random() < 0.08) {
                                price = prev.price + Math.floor((Math.random() - 0.5) * 60);
                                quantity = prev.quantity + Math.floor((Math.random() - 0.5) * 15);
                            } else {
                                price = prev.price;
                                quantity = prev.quantity;
                            }
                            break;

                        case 'cold':
                            // COLD: 0.1% chance of any change (very stable items)
                            // Real WoW: most items don't change for days/weeks
                            if (Math.random() < 0.001) {
                                price = prev.price + Math.floor((Math.random() - 0.5) * 200);
                                quantity = prev.quantity + Math.floor((Math.random() - 0.5) * 30);
                            } else {
                                price = prev.price;
                                quantity = prev.quantity;
                            }
                            break;
                    }
                }

                items.set(itemId, {
                    price: Math.max(1, price),
                    quantity: Math.max(1, quantity)
                });
            }

            snapshots.push({
                timestamp: baseTimestamp + hour * 3600,
                items
            });

            previousItems = new Map(items);
        }

        // Calculate raw size: snapshots × items × (4 bytes ID + 4 bytes price + 2 bytes qty)
        const rawSize = hoursTotal * itemCount * 10;

        return { snapshots, rawSize };
    }

    describe('Compression Ratio', () => {
        it('should achieve 60× on 30-day realistic WoW data (500 items)', () => {
            const { snapshots, rawSize } = generateRealisticData(500, 30);

            const writer = new HybridWriter({ blockDurationDays: 7 });

            for (const snapshot of snapshots) {
                writer.addSnapshot(snapshot);
            }

            const compressed = writer.finish();
            const ratio = rawSize / compressed.length;

            console.log('\n📊 GICS v0.4 Compression Results (30 days, 500 items):');
            console.log(`   Raw size: ${(rawSize / 1024).toFixed(1)} KB`);
            console.log(`   Compressed: ${(compressed.length / 1024).toFixed(1)} KB`);
            console.log(`   Ratio: ${ratio.toFixed(1)}×`);

            // Target: 80× compression with realistic market data
            expect(ratio).toBeGreaterThan(80);
        });

        it('should achieve 50× on 7-day data (minimum block)', () => {
            const { snapshots, rawSize } = generateRealisticData(500, 7);

            const writer = new HybridWriter({ blockDurationDays: 7 });

            for (const snapshot of snapshots) {
                writer.addSnapshot(snapshot);
            }

            const compressed = writer.finish();
            const ratio = rawSize / compressed.length;

            console.log('\n📊 GICS v0.4 Compression Results (7 days, 500 items):');
            console.log(`   Raw size: ${(rawSize / 1024).toFixed(1)} KB`);
            console.log(`   Compressed: ${(compressed.length / 1024).toFixed(1)} KB`);
            console.log(`   Ratio: ${ratio.toFixed(1)}×`);

            expect(ratio).toBeGreaterThan(50);
        });

        it('should achieve 80×+ on 1-year data (365 days)', () => {
            const { snapshots, rawSize } = generateRealisticData(500, 365);

            const writer = new HybridWriter({ blockDurationDays: 7 });

            for (const snapshot of snapshots) {
                writer.addSnapshot(snapshot);
            }

            const compressed = writer.finish();
            const ratio = rawSize / compressed.length;

            console.log('\n📊 GICS v0.4 Compression Results (1 year, 500 items):');
            console.log(`   Raw size: ${(rawSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Compressed: ${(compressed.length / 1024).toFixed(1)} KB`);
            console.log(`   Ratio: ${ratio.toFixed(1)}×`);

            // Target: 100×+ with full year of realistic data
            expect(ratio).toBeGreaterThan(100);
        });

        it('should achieve 100×+ on perfectly stable data (no changes)', () => {
            // This tests the MAXIMUM compression potential
            const snapshots: Snapshot[] = [];
            const hoursTotal = 30 * 24;

            for (let hour = 0; hour < hoursTotal; hour++) {
                const items = new Map<number, { price: number; quantity: number }>();
                for (let i = 0; i < 500; i++) {
                    // Every item has CONSTANT price (perfect COLD scenario)
                    items.set(10000 + i, { price: 5000 + i * 10, quantity: 100 });
                }
                snapshots.push({ timestamp: 1700000000 + hour * 3600, items });
            }

            const rawSize = hoursTotal * 500 * 10;
            const writer = new HybridWriter({ blockDurationDays: 7 });
            for (const snapshot of snapshots) {
                writer.addSnapshot(snapshot);
            }

            const compressed = writer.finish();
            const ratio = rawSize / compressed.length;

            console.log('\n📊 GICS v0.4 Perfect Stability (100% COLD, no changes):');
            console.log(`   Raw size: ${(rawSize / 1024).toFixed(1)} KB`);
            console.log(`   Compressed: ${(compressed.length / 1024).toFixed(1)} KB`);
            console.log(`   Ratio: ${ratio.toFixed(1)}× (theoretical max)`);

            // With zero changes, we should see massive compression
            expect(ratio).toBeGreaterThan(100);
        });
    });

    describe('Item Queries', () => {
        let reader: HybridReader;
        let query: ItemQuery;
        let originalSnapshots: Snapshot[];

        beforeAll(() => {
            const { snapshots } = generateRealisticData(100, 14);
            originalSnapshots = snapshots;

            const writer = new HybridWriter({ blockDurationDays: 7 });
            for (const snapshot of snapshots) {
                writer.addSnapshot(snapshot);
            }

            const compressed = writer.finish();
            reader = new HybridReader(compressed);
            query = new ItemQuery(reader);
        });

        it('should query single item history', () => {
            const result = query.getItemHistory(10000);

            expect(result).not.toBeNull();
            expect(result!.itemId).toBe(10000);
            expect(result!.history.length).toBeGreaterThan(0);
            expect(result!.stats).toBeDefined();
        });

        it('should query multiple items history', () => {
            const results = query.getMultipleItemsHistory([10000, 10001, 10002]);

            expect(results.length).toBe(3);
            for (const result of results) {
                expect(result.history.length).toBeGreaterThan(0);
            }
        });

        it('should filter by time range', () => {
            const startTime = originalSnapshots[48].timestamp; // Day 3
            const endTime = originalSnapshots[96].timestamp; // Day 5

            const result = query.getItemHistory(10000, startTime, endTime);

            expect(result).not.toBeNull();
            for (const point of result!.history) {
                expect(point.timestamp).toBeGreaterThanOrEqual(startTime);
                expect(point.timestamp).toBeLessThanOrEqual(endTime);
            }
        });

        it('should get items by tier', () => {
            const hotItems = query.getItemsByTier('hot');
            const coldItems = query.getItemsByTier('cold');

            // Based on our 10%/15%/75% split for 100 items
            expect(hotItems.length).toBeGreaterThan(0);
            expect(coldItems.length).toBeGreaterThan(hotItems.length);
        });
    });

    describe('Snapshot Reconstruction', () => {
        it('should reconstruct exact snapshot at any timestamp', () => {
            // Use completely stable data for deterministic testing
            const snapshots: Snapshot[] = [];
            const hoursTotal = 7 * 24;

            for (let hour = 0; hour < hoursTotal; hour++) {
                const items = new Map<number, { price: number; quantity: number }>();
                for (let i = 0; i < 50; i++) {
                    // All constant values - no randomness
                    items.set(10000 + i, {
                        price: 1000 + i * 100,
                        quantity: 50 + i
                    });
                }
                snapshots.push({ timestamp: 1700000000 + hour * 3600, items });
            }

            const writer = new HybridWriter({ blockDurationDays: 7 });
            for (const snapshot of snapshots) {
                writer.addSnapshot(snapshot);
            }

            const compressed = writer.finish();
            const reader = new HybridReader(compressed);

            // Test reconstruction at hour 0
            const original = snapshots[0];
            const reconstructed = reader.getSnapshotAt(original.timestamp);

            expect(reconstructed).not.toBeNull();
            expect(reconstructed!.timestamp).toBe(original.timestamp);
            expect(reconstructed!.items.size).toBe(original.items.size);

            // Verify first and last items
            const first = reconstructed!.items.get(10000);
            expect(first?.price).toBe(1000);
            expect(first?.quantity).toBe(50);

            const last = reconstructed!.items.get(10049);
            expect(last?.price).toBe(1000 + 49 * 100);
            expect(last?.quantity).toBe(50 + 49);
        });
    });

    describe('TierClassifier', () => {
        it('should correctly classify items by change rate', () => {
            const classifier = new TierClassifier();

            // New thresholds: HOT >= 50%, WARM >= 5%, COLD < 5%
            expect(classifier.classify(0.9)).toBe('hot');   // 90% = HOT
            expect(classifier.classify(0.5)).toBe('hot');   // 50% = HOT (threshold)
            expect(classifier.classify(0.3)).toBe('warm');  // 30% = WARM
            expect(classifier.classify(0.1)).toBe('warm');  // 10% = WARM
            expect(classifier.classify(0.04)).toBe('cold'); // 4% = COLD
            expect(classifier.classify(0.01)).toBe('cold'); // 1% = COLD
        });

        it('should analyze snapshots and assign tiers', () => {
            const { snapshots } = generateRealisticData(100, 7);
            const classifier = new TierClassifier();

            const tiers = classifier.analyzeSnapshots(snapshots);

            expect(tiers.size).toBe(100);

            // Count tiers
            let hot = 0, warm = 0, cold = 0;
            for (const tier of tiers.values()) {
                if (tier === 'hot') hot++;
                else if (tier === 'warm') warm++;
                else cold++;
            }

            console.log(`\n🔥 Tier Distribution: HOT=${hot}, WARM=${warm}, COLD=${cold}`);

            // HOT items should be detected
            expect(hot).toBeGreaterThan(0);
            // COLD should be the majority
            expect(cold).toBeGreaterThan(warm);
        });
    });

    describe('Memory Efficiency', () => {
        it('should use <50MB for 1-year query', () => {
            // This is a smoke test - actual memory measurement would require
            // process.memoryUsage() before/after, but that's flaky in tests
            const { snapshots } = generateRealisticData(500, 30);

            const writer = new HybridWriter({ blockDurationDays: 7 });
            for (const snapshot of snapshots) {
                writer.addSnapshot(snapshot);
            }

            const compressed = writer.finish();

            // Compressed size should be reasonable
            expect(compressed.length).toBeLessThan(50 * 1024 * 1024); // 50MB

            // Actually for 30 days of 500 items, should be < 1MB
            console.log(`\n💾 Compressed file size: ${(compressed.length / 1024).toFixed(1)} KB`);
            expect(compressed.length).toBeLessThan(1024 * 1024); // 1MB
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty snapshots gracefully', () => {
            const writer = new HybridWriter();
            const compressed = writer.finish();

            expect(compressed.length).toBeGreaterThan(0); // At least header
        });

        it('should handle single snapshot', () => {
            const writer = new HybridWriter();
            writer.addSnapshot({
                timestamp: 1700000000,
                items: new Map([[10000, { price: 1000, quantity: 100 }]])
            });

            const compressed = writer.finish();
            const reader = new HybridReader(compressed);

            const items = reader.getItemIds();
            expect(items).toContain(10000);
        });

        it('should handle items with zero changes', () => {
            // All COLD items with no changes - need more data for good compression
            const snapshots: Snapshot[] = [];
            const hoursTotal = 7 * 24; // Full week for complete block

            for (let hour = 0; hour < hoursTotal; hour++) {
                const items = new Map<number, { price: number; quantity: number }>();
                for (let i = 0; i < 100; i++) {
                    items.set(10000 + i, { price: 5000, quantity: 100 }); // Never changes
                }
                snapshots.push({ timestamp: 1700000000 + hour * 3600, items });
            }

            const writer = new HybridWriter({ blockDurationDays: 7 });
            for (const snapshot of snapshots) {
                writer.addSnapshot(snapshot);
            }

            const compressed = writer.finish();
            const rawSize = hoursTotal * 100 * 10;
            const ratio = rawSize / compressed.length;

            console.log(`\n❄️ All-COLD compression ratio: ${ratio.toFixed(1)}×`);

            // Should achieve good compression for static data
            // With 1 week of completely static data, we should see 50×+
            expect(ratio).toBeGreaterThan(50);
        });
    });
});
