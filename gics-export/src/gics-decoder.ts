/**
 * GICS Decoder - Decompression engine
 * 
 * Reconstructs original snapshots from compressed GICS data.
 * Supports both full decompression and selective item queries.
 */

import type { Snapshot, SnapshotDelta, GICSConfig, PricePoint } from './gics-types.js';
import { BitPackType, GICS_MAX_CHANGES_PER_SNAPSHOT, GICS_MAX_REMOVED_PER_SNAPSHOT } from './gics-types.js';

/**
 * Decodes GICS binary data back to snapshots
 */
/**
 * Helper class for safe reading with automatic bounds checking
 */
class ByteReader {
    private view: DataView;
    private offset: number = 0;
    private size: number;

    constructor(data: Uint8Array) {
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        this.size = data.byteLength;
    }

    private ensure(needed: number, context: string) {
        if (this.offset + needed > this.size) {
            throw new Error(`[GICS] Corrupted data: unexpected end while reading ${context} (need ${needed} bytes at offset ${this.offset}, have ${this.size})`);
        }
    }

    readUint8(context: string): number {
        this.ensure(1, context);
        const val = this.view.getUint8(this.offset);
        this.offset += 1;
        return val;
    }

    readInt8(context: string): number {
        this.ensure(1, context);
        const val = this.view.getInt8(this.offset);
        this.offset += 1;
        return val;
    }

    readUint16(context: string): number {
        this.ensure(2, context);
        const val = this.view.getUint16(this.offset, true);
        this.offset += 2;
        return val;
    }

    readInt16(context: string): number {
        this.ensure(2, context);
        const val = this.view.getInt16(this.offset, true);
        this.offset += 2;
        return val;
    }

    readUint32(context: string): number {
        this.ensure(4, context);
        const val = this.view.getUint32(this.offset, true);
        this.offset += 4;
        return val;
    }

    get bytesRead(): number {
        return this.offset;
    }
}

export class GICSDecoder {
    private config: Required<GICSConfig>;
    private reverseDictionary: Map<number, number>;

    // Reconstructed snapshots cache
    private snapshots: Snapshot[] = [];

    constructor(config: GICSConfig = {}) {
        this.config = {
            dictionary: config.dictionary || new Map(),
            compressionLevel: config.compressionLevel ?? 3,
            chunkSize: config.chunkSize ?? 24,
            enableChecksums: config.enableChecksums ?? true,
            rotationPolicy: config.rotationPolicy ?? 'off'
        };

        // Build reverse dictionary (index -> itemId)
        this.reverseDictionary = new Map();
        for (const [itemId, index] of this.config.dictionary) {
            this.reverseDictionary.set(index, itemId);
        }
    }

    /**
     * Decode a single snapshot delta from binary
     */
    decodeSnapshot(data: Uint8Array, previousSnapshot: Snapshot | null): { snapshot: Snapshot, bytesRead: number } {
        const reader = new ByteReader(data);

        // Read header with validation
        const timestamp = reader.readUint32('snapshot header timestamp');
        const changeCount = reader.readUint32('snapshot header changeCount');

        // Sanity check: prevent absurd allocations from corrupted data
        if (changeCount > GICS_MAX_CHANGES_PER_SNAPSHOT) {
            throw new Error(`[GICS] Corrupted data: changeCount ${changeCount} exceeds sanity limit (${GICS_MAX_CHANGES_PER_SNAPSHOT})`);
        }

        // Initialize with previous snapshot's items
        const items = new Map<number, { price: number; quantity: number }>();
        if (previousSnapshot) {
            for (const [id, itemData] of previousSnapshot.items) {
                items.set(id, { ...itemData });
            }
        }

        // Apply changes with bounds checking via Reader
        for (let i = 0; i < changeCount; i++) {
            const encodedId = reader.readUint32(`change ${i} id`);
            const itemId = this.reverseDictionary.get(encodedId) ?? encodedId;

            const packType = reader.readUint8(`change ${i} packType`) as BitPackType;

            let price: number;
            const prevData = previousSnapshot?.items.get(itemId);
            const prevPrice = prevData?.price ?? 0;

            switch (packType) {
                case BitPackType.UNCHANGED:
                    price = prevPrice;
                    break;
                case BitPackType.DELTA_SMALL:
                    price = prevPrice + reader.readInt8(`delta small for item ${itemId}`);
                    break;
                case BitPackType.DELTA_MEDIUM:
                    price = prevPrice + reader.readInt16(`delta medium for item ${itemId}`);
                    break;
                case BitPackType.ABSOLUTE:
                    price = reader.readUint32(`absolute price for item ${itemId}`);
                    break;
                default:
                    console.warn(`[GICS] Unknown pack type ${packType}, using previous price`);
                    price = prevPrice;
            }

            const quantity = reader.readUint16(`quantity for item ${itemId}`);
            items.set(itemId, { price, quantity });
        }

        // Handle removed items with validation
        const removedCount = reader.readUint16('removed count');

        if (removedCount > GICS_MAX_REMOVED_PER_SNAPSHOT) {
            throw new Error(`[GICS] Corrupted data: removedCount ${removedCount} exceeds sanity limit (${GICS_MAX_REMOVED_PER_SNAPSHOT})`);
        }

        for (let i = 0; i < removedCount; i++) {
            const encodedId = reader.readUint32(`removed item ${i}`);
            const itemId = this.reverseDictionary.get(encodedId) ?? encodedId;
            items.delete(itemId);
        }

        const snapshot: Snapshot = { timestamp, items };
        this.snapshots.push(snapshot);

        return { snapshot, bytesRead: reader.bytesRead };
    }

    /**
     * Get full history for a specific item (efficient - doesn't decompress everything)
     */
    getItemHistory(itemId: number, fromTimestamp?: number, toTimestamp?: number): PricePoint[] {
        const history: PricePoint[] = [];

        for (const snapshot of this.snapshots) {
            if (fromTimestamp && snapshot.timestamp < fromTimestamp) continue;
            if (toTimestamp && snapshot.timestamp > toTimestamp) break;

            const data = snapshot.items.get(itemId);
            if (data) {
                history.push({
                    timestamp: snapshot.timestamp,
                    price: data.price,
                    quantity: data.quantity
                });
            }
        }

        return history;
    }

    /**
     * Get current price for an item
     */
    getCurrentPrice(itemId: number): number | undefined {
        if (this.snapshots.length === 0) return undefined;
        const latest = this.snapshots[this.snapshots.length - 1];
        return latest.items.get(itemId)?.price;
    }

    /**
     * Get all items with current prices
     */
    getAllCurrentPrices(): Map<number, { price: number; quantity: number }> {
        if (this.snapshots.length === 0) return new Map();
        return new Map(this.snapshots[this.snapshots.length - 1].items);
    }

    /**
     * Analyze trend for an item
     */
    analyzeTrend(itemId: number, days: number = 7): {
        trend: 'up' | 'down' | 'stable';
        changePercent: number;
        min: number;
        max: number;
        avg: number;
        volatility: number;
    } | null {
        const cutoff = Date.now() / 1000 - (days * 24 * 60 * 60);
        const history = this.getItemHistory(itemId, cutoff);

        // ROBUSTNESS: Need at least 3 data points for meaningful trend
        if (history.length < 3) return null;

        const prices = history.map(h => h.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

        // Standard deviation for volatility (guard against avg=0)
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / prices.length;
        const volatility = avg > 0 ? Math.sqrt(variance) / avg : 0;

        // Trend: compare first third to last third
        const third = Math.max(1, Math.floor(prices.length / 3)); // CRITICAL: Prevent division by zero
        const firstAvg = prices.slice(0, third).reduce((a, b) => a + b, 0) / third;
        const lastAvg = prices.slice(-third).reduce((a, b) => a + b, 0) / third;

        // Guard against firstAvg = 0
        const changePercent = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;

        let trend: 'up' | 'down' | 'stable';
        if (changePercent > 5) trend = 'up';
        else if (changePercent < -5) trend = 'down';
        else trend = 'stable';

        return { trend, changePercent, min, max, avg, volatility };
    }

    /**
     * Get loaded snapshot count
     */
    getSnapshotCount(): number {
        return this.snapshots.length;
    }

    /**
     * Clear cache
     */
    clear(): void {
        this.snapshots = [];
    }
}
