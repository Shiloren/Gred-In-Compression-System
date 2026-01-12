import { describe, it, expect, beforeAll } from 'vitest';
import { HybridWriter, HybridReader, ItemQuery, TimeRange } from '../src/lib/gics/gics-hybrid';
import type { Snapshot } from '../src/lib/gics/gics-types';

describe('GICS Sparse Queries', () => {
    let reader: HybridReader;
    let query: ItemQuery;
    let originalSnapshots: Snapshot[];

    // Helper to generate data
    function generateData(itemCount: number, days: number): Snapshot[] {
        const snapshots: Snapshot[] = [];
        const startTs = 1704067200; // 2024-01-01

        for (let day = 0; day < days; day++) {
            const items = new Map<number, { price: number; quantity: number }>();
            for (let i = 0; i < itemCount; i++) {
                items.set(10000 + i, { price: 1000 + day, quantity: 100 });
            }
            snapshots.push({
                timestamp: startTs + day * 86400,
                items
            });
        }
        return snapshots;
    }

    beforeAll(() => {
        // Generate 30 days of data
        originalSnapshots = generateData(10, 30);

        const writer = new HybridWriter({ blockDurationDays: 7 });
        for (const snap of originalSnapshots) {
            writer.addSnapshot(snap);
        }

        const compressed = writer.finish();
        reader = new HybridReader(compressed);
        query = new ItemQuery(reader);
    });

    it('should query specific sparsely distributed days', () => {
        // Range 1: Day 2-3
        // Range 2: Day 10-11
        // Range 3: Day 20-21
        const ranges: TimeRange[] = [
            {
                start: originalSnapshots[2].timestamp,
                end: originalSnapshots[3].timestamp
            },
            {
                start: originalSnapshots[10].timestamp,
                end: originalSnapshots[11].timestamp
            },
            {
                start: originalSnapshots[20].timestamp,
                end: originalSnapshots[21].timestamp
            }
        ];

        // Use reader directly since it's cleaner for testing internal queryItems
        const results = reader.queryItems({
            itemIds: [10000],
            timeRanges: ranges
        });

        const history = results[0].history;

        expect(history.length).toBe(6);

        // Verify timestamps are within ranges
        for (const point of history) {
            const inRange = ranges.some(r => point.timestamp >= r.start && point.timestamp <= r.end);
            expect(inRange).toBe(true);
        }
    });

    it('should combine legacy startTime/endTime with sparse ranges', () => {
        const startTime = originalSnapshots[5].timestamp;
        const endTime = originalSnapshots[25].timestamp;

        const ranges: TimeRange[] = [
            {
                start: originalSnapshots[2].timestamp, // Outside global range
                end: originalSnapshots[3].timestamp
            },
            {
                start: originalSnapshots[10].timestamp, // Inside
                end: originalSnapshots[11].timestamp
            },
            {
                start: originalSnapshots[20].timestamp, // Inside
                end: originalSnapshots[21].timestamp
            }
        ];

        const results = reader.queryItems({
            itemIds: [10000],
            startTime,
            endTime,
            timeRanges: ranges
        });

        const history = results[0].history;

        expect(history.length).toBe(4);

        for (const point of history) {
            expect(point.timestamp).toBeGreaterThanOrEqual(startTime);
            expect(point.timestamp).toBeLessThanOrEqual(endTime);
        }
    });

    it('should handle non-overlapping ranges gracefully', () => {
        const ranges: TimeRange[] = [
            { start: 0, end: 100 } // Way before data
        ];

        const results = reader.queryItems({
            itemIds: [10000],
            timeRanges: ranges
        });

        expect(results[0].history.length).toBe(0);
    });
});
