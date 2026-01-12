/**
 * GICS Encoder - Core compression engine
 * 
 * Implements delta encoding, bit-packing, and final compression.
 * This is the heart of the GICS compression system.
 */

import type { Snapshot, SnapshotDelta, GICSConfig } from './gics-types.js';
import { BitPackType, GICS_MAX_CHANGES_PER_SNAPSHOT, GICS_MAX_REMOVED_PER_SNAPSHOT } from './gics-types.js';

/**
 * Encodes price snapshots into compact binary format
 */
export class GICSEncoder {
    private previousSnapshot: Snapshot | null = null;
    private config: Required<GICSConfig>;

    // Statistics
    private stats = {
        unchangedCount: 0,
        deltaSmallCount: 0,
        deltaMediumCount: 0,
        absoluteCount: 0,
        totalItems: 0
    };

    constructor(config: GICSConfig = {}) {
        this.config = {
            dictionary: config.dictionary || new Map(),
            compressionLevel: config.compressionLevel ?? 3,
            chunkSize: config.chunkSize ?? 24, // 24 snapshots = 1 day at hourly
            enableChecksums: config.enableChecksums ?? true,
            rotationPolicy: config.rotationPolicy ?? 'off' // v0.2 experimental: default to legacy behavior
        };
    }

    /**
     * Encode a new snapshot, returning the delta from previous
     * @param snapshot - The snapshot to encode
     * @param forceAbsolute - If true, encodes as keyframe (absolute values, no delta)
     */
    encodeSnapshot(snapshot: Snapshot, forceAbsolute: boolean = false): Uint8Array {
        // Validation: warn on empty snapshots
        if (snapshot.items.size === 0) {
            console.warn('[GICS] Empty snapshot received - this may indicate data collection issues');
        }

        // GICS v0.2 experimental: Keyframe support
        // When forceAbsolute=true, we encode without reference to previousSnapshot
        // This creates a self-contained I-frame that can be read independently
        const delta = forceAbsolute ? this.computeDeltaAsKeyframe(snapshot) : this.computeDelta(snapshot);
        const packed = this.bitPack(delta);

        // Update previous for next delta (always update, even for keyframes)
        this.previousSnapshot = snapshot;

        return packed;
    }

    /**
     * Compute delta between current and previous snapshot
     */
    private computeDelta(current: Snapshot): SnapshotDelta {
        const changes: [number, number, number][] = [];
        const removed: number[] = [];

        if (!this.previousSnapshot) {
            // First snapshot - all items are "changes"
            for (const [itemId, data] of current.items) {
                changes.push([itemId, data.price, data.quantity]);
            }

            return {
                baseTimestamp: -1, // Sentinel: -1 means "no previous snapshot"
                timestamp: current.timestamp,
                changes,
                removed
            };
        }

        // Find changed items
        for (const [itemId, data] of current.items) {
            const prev = this.previousSnapshot.items.get(itemId);

            if (!prev) {
                // New item
                changes.push([itemId, data.price, data.quantity]);
            } else if (prev.price !== data.price || prev.quantity !== data.quantity) {
                // Changed item
                changes.push([itemId, data.price, data.quantity]);
            }
            // Unchanged items are not stored
        }

        // Find removed items
        for (const itemId of this.previousSnapshot.items.keys()) {
            if (!current.items.has(itemId)) {
                removed.push(itemId);
            }
        }

        return {
            baseTimestamp: this.previousSnapshot.timestamp,
            timestamp: current.timestamp,
            changes,
            removed
        };
    }

    /**
     * Compute delta as keyframe (absolute encoding, v0.2+ experimental)
     * Forces baseTimestamp=-1 to indicate self-contained snapshot
     */
    private computeDeltaAsKeyframe(current: Snapshot): SnapshotDelta {
        const changes: [number, number, number][] = [];

        // Encode ALL items as absolute values (no delta)
        for (const [itemId, data] of current.items) {
            changes.push([itemId, data.price, data.quantity]);
        }

        return {
            baseTimestamp: -1, // Sentinel: Keyframe (no dependencies)
            timestamp: current.timestamp,
            changes,
            removed: [] // Keyframes don't track removals (they define the complete state)
        };
    }

    /**
     * Bit-pack a delta into compact binary format
     */
    private bitPack(delta: SnapshotDelta): Uint8Array {
        // CRITICAL FIX: Use worst-case sizing to prevent buffer overflow
        // Worst case per item: 4 (id) + 1 (type) + 4 (abs price) + 2 (qty) = 11 bytes
        // Add safety margin of 16 bytes per item + header overhead
        const estimatedSize = 8 + (delta.changes.length * 16) + 2 + (delta.removed.length * 4) + 32;
        const buffer = new ArrayBuffer(estimatedSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Header
        view.setUint32(offset, delta.timestamp, true); offset += 4;
        view.setUint32(offset, delta.changes.length, true); offset += 4;

        // Changes with adaptive encoding
        for (const [itemId, price, quantity] of delta.changes) {
            // Item ID (4 bytes or dictionary index)
            const encodedId = this.config.dictionary.get(itemId) ?? itemId;
            view.setUint32(offset, encodedId, true); offset += 4;

            // Determine encoding type
            const prevData = this.previousSnapshot?.items.get(itemId);
            const prevPrice = prevData?.price ?? 0;
            const priceDelta = price - prevPrice;

            let packType: BitPackType;

            if (prevData && price === prevPrice) {
                packType = BitPackType.UNCHANGED;
                this.stats.unchangedCount++;
            } else if (Math.abs(priceDelta) <= 127) {
                packType = BitPackType.DELTA_SMALL;
                this.stats.deltaSmallCount++;
            } else if (Math.abs(priceDelta) <= 32767) {
                packType = BitPackType.DELTA_MEDIUM;
                this.stats.deltaMediumCount++;
            } else {
                packType = BitPackType.ABSOLUTE;
                this.stats.absoluteCount++;
            }

            // Pack type (2 bits) + price value
            switch (packType) {
                case BitPackType.UNCHANGED:
                    view.setUint8(offset, packType); offset += 1;
                    break;
                case BitPackType.DELTA_SMALL:
                    view.setUint8(offset, packType); offset += 1;
                    view.setInt8(offset, priceDelta); offset += 1;
                    break;
                case BitPackType.DELTA_MEDIUM:
                    view.setUint8(offset, packType); offset += 1;
                    view.setInt16(offset, priceDelta, true); offset += 2;
                    break;
                case BitPackType.ABSOLUTE:
                    view.setUint8(offset, packType); offset += 1;
                    view.setUint32(offset, price, true); offset += 4;
                    break;
            }

            // Quantity (varint encoded - simplified to 2 bytes for MVP)
            // ROBUSTNESS: Warn if quantity is truncated
            if (quantity > 65535) {
                console.warn(`[GICS] Quantity ${quantity} for item ${itemId} truncated to 65535`);
            }
            view.setUint16(offset, Math.min(quantity, 65535), true); offset += 2;

            this.stats.totalItems++;
        }

        // Removed items count + IDs
        view.setUint16(offset, delta.removed.length, true); offset += 2;
        for (const itemId of delta.removed) {
            const encodedId = this.config.dictionary.get(itemId) ?? itemId;
            view.setUint32(offset, encodedId, true); offset += 4;
        }

        // Return trimmed buffer
        return new Uint8Array(buffer.slice(0, offset));
    }

    /**
     * Get compression statistics
     */
    getStats(): {
        totalItems: number;
        unchangedPercent: number;
        deltaSmallPercent: number;
        deltaMediumPercent: number;
        absolutePercent: number;
        avgBitsPerItem: number;
    } {
        const total = this.stats.totalItems || 1;

        // Calculate average bits per item
        const bits =
            this.stats.unchangedCount * 1 +     // Just the type bit
            this.stats.deltaSmallCount * 11 +   // Type + 8 bits
            this.stats.deltaMediumCount * 19 +  // Type + 16 bits
            this.stats.absoluteCount * 35;      // Type + 32 bits

        return {
            totalItems: this.stats.totalItems,
            unchangedPercent: (this.stats.unchangedCount / total) * 100,
            deltaSmallPercent: (this.stats.deltaSmallCount / total) * 100,
            deltaMediumPercent: (this.stats.deltaMediumCount / total) * 100,
            absolutePercent: (this.stats.absoluteCount / total) * 100,
            avgBitsPerItem: bits / total
        };
    }

    /**
     * Reset encoder state (for new file/chunk)
     */
    reset(): void {
        this.previousSnapshot = null;
        this.stats = {
            unchangedCount: 0,
            deltaSmallCount: 0,
            deltaMediumCount: 0,
            absoluteCount: 0,
            totalItems: 0
        };
    }

    /**
     * Manually set previous snapshot (for resuming sessions)
     */
    setPreviousSnapshot(snapshot: Snapshot): void {
        this.previousSnapshot = snapshot;
    }

    /**
     * Get current reference snapshot
     */
    getPreviousSnapshot(): Snapshot | null {
        return this.previousSnapshot;
    }
}
