/**
 * GICS v0.4 - Hybrid Storage Engine
 * 
 * Dual-index architecture for 100× compression with flexible item queries.
 * Maintains complete snapshots while enabling O(1) per-item access.
 * 
 * @author Gred In Labs
 * @version 0.4.0
 */

import { crc32 } from 'node:zlib';
import { compress, decompress } from '@mongodb-js/zstd';
import { encodeVarint, decodeVarint } from './gics-columnar.js';
import type { PricePoint, Snapshot, GICSStats } from './gics-types.js';

// ============================================================================
// Types
// ============================================================================

export interface HybridConfig {
    /** Days per block (default: 7) */
    blockDurationDays?: number;
    /** Tier classification thresholds */
    tierThresholds?: {
        /** Change rate to be HOT (default: 0.8 = 80%) */
        hotChangeRate: number;
        /** Change rate to be WARM (default: 0.2 = 20%) */
        warmChangeRate: number;
    };
    /** Compression level 1-9 (default: 9) */
    compressionLevel?: number;
}

export interface QueryFilter {
    /** Specific item IDs to query */
    itemIds?: number[];
    /** Start timestamp (Unix seconds) */
    startTime?: number;
    /** End timestamp (Unix seconds) */
    endTime?: number;
    /** Max results per item */
    limit?: number;
    /** Sparse time ranges to query (inclusive). If overlapping with startTime/endTime, both filters apply. */
    timeRanges?: TimeRange[];
}

export interface TimeRange {
    start: number;
    end: number;
}

export interface ItemQueryResult {
    itemId: number;
    history: PricePoint[];
    stats?: {
        min: number;
        max: number;
        avg: number;
        volatility: number;
        trend: 'up' | 'down' | 'stable';
        trendPercent: number;
    };
}

export type ItemTier = 'hot' | 'warm' | 'cold';

interface BlockHeader {
    blockId: number;
    startTimestamp: number;
    endTimestamp: number;
    snapshotCount: number;
    itemCount: number;
    compressedSize: number;
}

interface ItemIndexEntry {
    itemId: number;
    tier: ItemTier;
    /** Map of blockId → offset within block's price data */
    blockPositions: Map<number, number>;
}

interface TemporalIndexEntry {
    blockId: number;
    startTimestamp: number;
    offset: number;
}

// ============================================================================
// Constants
// ============================================================================

const MAGIC = new Uint8Array([0x47, 0x49, 0x43, 0x53]); // GICS
const VERSION = 1;
const MIN_SUPPORTED_VERSION = 1;

export class VersionMismatchError extends Error {
    constructor(fileVersion: number, minSupported: number) {
        super(`GICS File Version Mismatch: File=${fileVersion}, Supported=${minSupported}. This file is too new or too old for this reader.`);
        this.name = 'VersionMismatchError';
    }
}
const HOURS_PER_DAY = 24;
const DEFAULT_BLOCK_DAYS = 7;
const DEFAULT_HOT_THRESHOLD = 0.5;  // 50%+ change rate = HOT
const DEFAULT_WARM_THRESHOLD = 0.05; // 5%+ change rate = WARM

// ============================================================================
// Tier Classifier
// ============================================================================

export class TierClassifier {
    private hotThreshold: number;
    private warmThreshold: number;

    constructor(config?: HybridConfig) {
        this.hotThreshold = config?.tierThresholds?.hotChangeRate ?? DEFAULT_HOT_THRESHOLD;
        this.warmThreshold = config?.tierThresholds?.warmChangeRate ?? DEFAULT_WARM_THRESHOLD;
    }

    /**
     * Classify item based on change frequency
     */
    classify(changeRate: number): ItemTier {
        if (changeRate >= this.hotThreshold) return 'hot';
        if (changeRate >= this.warmThreshold) return 'warm';
        return 'cold';
    }

    /**
     * Analyze snapshots to determine item tiers
     */
    analyzeSnapshots(snapshots: Snapshot[]): Map<number, ItemTier> {
        const itemChangeCounts = new Map<number, number>();
        const itemTotalCounts = new Map<number, number>();

        for (let i = 1; i < snapshots.length; i++) {
            const prev = snapshots[i - 1];
            const curr = snapshots[i];

            for (const [itemId, data] of curr.items) {
                const prevData = prev.items.get(itemId);
                const total = (itemTotalCounts.get(itemId) ?? 0) + 1;
                itemTotalCounts.set(itemId, total);

                if (!prevData || prevData.price !== data.price) {
                    const changes = (itemChangeCounts.get(itemId) ?? 0) + 1;
                    itemChangeCounts.set(itemId, changes);
                }
            }
        }

        const tiers = new Map<number, ItemTier>();
        for (const [itemId, total] of itemTotalCounts) {
            const changes = itemChangeCounts.get(itemId) ?? 0;
            const changeRate = changes / total;
            tiers.set(itemId, this.classify(changeRate));
        }

        return tiers;
    }
}

// ============================================================================
// Hybrid Writer
// ============================================================================

export class HybridWriter {
    private config: Required<HybridConfig>;
    private snapshots: Snapshot[] = [];
    private blocks: Uint8Array[] = [];
    private temporalIndex: TemporalIndexEntry[] = [];
    private itemIndex: Map<number, ItemIndexEntry> = new Map();
    private tierClassifier: TierClassifier;

    constructor(config: HybridConfig = {}) {
        this.config = {
            blockDurationDays: config.blockDurationDays ?? DEFAULT_BLOCK_DAYS,
            tierThresholds: config.tierThresholds ?? {
                hotChangeRate: DEFAULT_HOT_THRESHOLD,
                warmChangeRate: DEFAULT_WARM_THRESHOLD
            },
            compressionLevel: config.compressionLevel ?? 9
        };
        this.tierClassifier = new TierClassifier(this.config);
    }

    /**
     * Add a snapshot to the current block
     */
    async addSnapshot(snapshot: Snapshot): Promise<void> {
        this.snapshots.push(snapshot);

        const snapshotsPerBlock = this.config.blockDurationDays * HOURS_PER_DAY;
        if (this.snapshots.length >= snapshotsPerBlock) {
            await this.flushBlock();
        }
    }

    /**
     * Flush current snapshots to a compressed block
     */
    private async flushBlock(): Promise<void> {
        if (this.snapshots.length === 0) return;

        const blockId = this.blocks.length;
        const startTimestamp = this.snapshots[0].timestamp;
        const endTimestamp = this.snapshots[this.snapshots.length - 1].timestamp;

        // Analyze item tiers for this block
        const tiers = this.tierClassifier.analyzeSnapshots(this.snapshots);

        // Encode block with tiered compression
        const blockData = await this.encodeBlock(this.snapshots, tiers, blockId);

        // Update temporal index
        const offset = this.blocks.reduce((sum, b) => sum + b.length, 0);
        this.temporalIndex.push({ blockId, startTimestamp, offset });

        this.blocks.push(blockData);
        this.snapshots = [];
    }

    /**
     * Encode a block of snapshots with tiered compression
     * KEY OPTIMIZATION: Separate tiers and compress each optimally
     */
    private async encodeBlock(snapshots: Snapshot[], tiers: Map<number, ItemTier>, blockId: number): Promise<Uint8Array> {
        // Collect all unique item IDs
        const allItemIds = new Set<number>();
        for (const snap of snapshots) {
            for (const itemId of snap.items.keys()) {
                allItemIds.add(itemId);
            }
        }
        const sortedIds = Array.from(allItemIds).sort((a, b) => a - b);

        // Separate items by tier for optimal compression
        const hotIds: number[] = [];
        const warmIds: number[] = [];
        const orderedColdConstants: number[] = [];
        const orderedColdVariables: number[] = [];

        for (const itemId of sortedIds) {
            const tier = tiers.get(itemId) ?? 'cold';
            if (tier === 'hot') hotIds.push(itemId);
            else if (tier === 'warm') warmIds.push(itemId);
            else {
                // Pre-classify cold items to ensure 'constant' ones come first in the ID list
                // This is CRITICAL because the Reader assumes the first 'coldConstantCount' items
                // in the coldIds list are the ones that use the constant value stream.

                // We need to peek at the data to decide
                let isConstant = true;
                const firstPrice = snapshots[0].items.get(itemId)?.price ?? 0;

                for (let i = 1; i < snapshots.length; i++) {
                    const p = snapshots[i].items.get(itemId)?.price ?? 0;
                    if (p !== firstPrice) {
                        isConstant = false;
                        break;
                    }
                }

                if (isConstant) orderedColdConstants.push(itemId);
                else orderedColdVariables.push(itemId);
            }
        }
        const coldIds = [...orderedColdConstants, ...orderedColdVariables];

        // Encode timestamps (DoD) - shared across all tiers
        const timestamps = snapshots.map(s => s.timestamp);
        const timestampDeltas = this.encodeDoD(timestamps);
        const timestampsEncoded = encodeVarint(timestampDeltas);

        // Encode item IDs (delta) - only store which IDs are in each tier
        const allIdsInOrder = [...hotIds, ...warmIds, ...coldIds];
        const idDeltas = allIdsInOrder.length > 0 ? [allIdsInOrder[0]] : [];
        for (let i = 1; i < allIdsInOrder.length; i++) {
            idDeltas.push(allIdsInOrder[i] - allIdsInOrder[i - 1]);
        }
        const idsEncoded = encodeVarint(idDeltas);

        // TIER-SPECIFIC COMPRESSION

        // HOT tier: Full DoD - these items change predictably
        const hotPricesDoD: number[] = [];
        for (const itemId of hotIds) {
            const prices: number[] = [];
            for (const snap of snapshots) {
                prices.push(snap.items.get(itemId)?.price ?? 0);
            }
            // DoD for each item, then flatten
            hotPricesDoD.push(...this.encodeDoD(prices));
        }
        const hotEncoded = encodeVarint(hotPricesDoD);

        // WARM tier: Sparse bitmap + deltas
        const warmBitmaps: Uint8Array[] = [];
        const warmValues: number[] = [];
        for (const itemId of warmIds) {
            const prices: number[] = [];
            for (const snap of snapshots) {
                prices.push(snap.items.get(itemId)?.price ?? 0);
            }

            // Create bitmap and collect non-zero deltas
            const bitmap = new Uint8Array(Math.ceil(snapshots.length / 8));
            let prev = prices[0];
            warmValues.push(prev); // First value absolute

            for (let i = 1; i < prices.length; i++) {
                if (prices[i] !== prev) {
                    bitmap[Math.floor(i / 8)] |= (1 << (i % 8));
                    warmValues.push(prices[i] - prev);
                    prev = prices[i];
                }
            }
            warmBitmaps.push(bitmap);
        }
        const warmBitmapCombined = this.concatArrays(warmBitmaps);
        const warmValuesEncoded = encodeVarint(warmValues);

        // COLD tier: ULTRA AGGRESSIVE - most items are constant!
        // Format: [constantCount][constant values...][variableCount][variable data...]
        const coldConstants: number[] = [];
        const coldVariableBitmaps: Uint8Array[] = [];
        const coldVariableValues: number[] = [];
        let coldConstantCount = 0;
        let coldVariableCount = 0;

        for (const itemId of coldIds) {
            const prices: number[] = [];
            for (const snap of snapshots) {
                prices.push(snap.items.get(itemId)?.price ?? 0);
            }

            // Check if constant
            const unique = new Set(prices);
            if (unique.size === 1) {
                // CONSTANT: Just store the value once. Massive savings!
                coldConstants.push(prices[0]);
                coldConstantCount++;
            } else {
                // Variable: Use sparse bitmap like WARM
                const bitmap = new Uint8Array(Math.ceil(snapshots.length / 8));
                let prev = prices[0];
                coldVariableValues.push(prev);

                for (let i = 1; i < prices.length; i++) {
                    if (prices[i] !== prev) {
                        bitmap[Math.floor(i / 8)] |= (1 << (i % 8));
                        coldVariableValues.push(prices[i] - prev);
                        prev = prices[i];
                    }
                }
                coldVariableBitmaps.push(bitmap);
                coldVariableCount++;
            }
        }

        const coldConstantsEncoded = encodeVarint(coldConstants);
        const coldVariableBitmapCombined = this.concatArrays(coldVariableBitmaps);
        const coldVariableValuesEncoded = encodeVarint(coldVariableValues);

        // QUANTITIES: RLE for all items (quantities typically stable)
        const allQuantitiesRLE: number[] = [];
        for (const itemId of allIdsInOrder) {
            const quantities: number[] = [];
            for (const snap of snapshots) {
                quantities.push(snap.items.get(itemId)?.quantity ?? 0);
            }
            // RLE encode
            let i = 0;
            while (i < quantities.length) {
                const val = quantities[i];
                let count = 1;
                while (i + count < quantities.length && quantities[i + count] === val && count < 255) {
                    count++;
                }
                allQuantitiesRLE.push(count, val);
                i += count;
            }
        }
        const quantitiesEncoded = encodeVarint(allQuantitiesRLE);

        // Update item index
        let itemPosition = 0;
        for (const itemId of allIdsInOrder) {
            let entry = this.itemIndex.get(itemId);
            if (!entry) {
                const tier = tiers.get(itemId) ?? 'cold';
                entry = { itemId, tier, blockPositions: new Map() };
                this.itemIndex.set(itemId, entry);
            }
            entry.blockPositions.set(blockId, itemPosition++);
        }

        // Combine all data with detailed header
        // Header layout: 6×uint16 (12 bytes) + 9×uint32 (36 bytes) = 48 bytes
        const header = new Uint8Array(48);
        const headerView = new DataView(header.buffer);
        let hOffset = 0;

        headerView.setUint16(hOffset, snapshots.length, true); hOffset += 2;      // snapshotCount
        headerView.setUint16(hOffset, allIdsInOrder.length, true); hOffset += 2;  // totalItemCount
        headerView.setUint16(hOffset, hotIds.length, true); hOffset += 2;         // hotCount
        headerView.setUint16(hOffset, warmIds.length, true); hOffset += 2;        // warmCount
        headerView.setUint16(hOffset, coldConstantCount, true); hOffset += 2;     // coldConstantCount
        headerView.setUint16(hOffset, coldVariableCount, true); hOffset += 2;     // coldVariableCount

        headerView.setUint32(hOffset, timestampsEncoded.length, true); hOffset += 4;
        headerView.setUint32(hOffset, idsEncoded.length, true); hOffset += 4;
        headerView.setUint32(hOffset, hotEncoded.length, true); hOffset += 4;
        headerView.setUint32(hOffset, warmBitmapCombined.length, true); hOffset += 4;
        headerView.setUint32(hOffset, warmValuesEncoded.length, true); hOffset += 4;
        headerView.setUint32(hOffset, coldConstantsEncoded.length, true); hOffset += 4;
        headerView.setUint32(hOffset, coldVariableBitmapCombined.length, true); hOffset += 4;
        headerView.setUint32(hOffset, coldVariableValuesEncoded.length, true); hOffset += 4;
        headerView.setUint32(hOffset, quantitiesEncoded.length, true); hOffset += 4;

        // Combine all sections
        const totalSize = header.length +
            timestampsEncoded.length + idsEncoded.length +
            hotEncoded.length + warmBitmapCombined.length + warmValuesEncoded.length +
            coldConstantsEncoded.length + coldVariableBitmapCombined.length + coldVariableValuesEncoded.length +
            quantitiesEncoded.length;

        const combined = new Uint8Array(totalSize);
        let offset = 0;
        combined.set(header, offset); offset += header.length;
        combined.set(timestampsEncoded, offset); offset += timestampsEncoded.length;
        combined.set(idsEncoded, offset); offset += idsEncoded.length;
        combined.set(hotEncoded, offset); offset += hotEncoded.length;
        combined.set(warmBitmapCombined, offset); offset += warmBitmapCombined.length;
        combined.set(warmValuesEncoded, offset); offset += warmValuesEncoded.length;
        combined.set(coldConstantsEncoded, offset); offset += coldConstantsEncoded.length;
        combined.set(coldVariableBitmapCombined, offset); offset += coldVariableBitmapCombined.length;
        combined.set(coldVariableValuesEncoded, offset); offset += coldVariableValuesEncoded.length;
        combined.set(quantitiesEncoded, offset);

        // Add per-block CRC32 for granular corruption detection
        const blockCrc = crc32(combined);
        const withCrc = new Uint8Array(combined.length + 4);
        withCrc.set(combined);
        new DataView(withCrc.buffer).setUint32(combined.length, blockCrc, true);

        // Compress with Zstd instead of zlib
        // Use configured level (default 9, max 22 for Zstd)
        return await compress(Buffer.from(withCrc), this.config.compressionLevel);
    }

    /**
     * Delta-of-delta encoding
     */
    private encodeDoD(values: number[]): number[] {
        if (values.length === 0) return [];
        if (values.length === 1) return [values[0]];

        const deltas = [values[0], values[1] - values[0]];
        for (let i = 2; i < values.length; i++) {
            const delta = values[i] - values[i - 1];
            const prevDelta = values[i - 1] - values[i - 2];
            deltas.push(delta - prevDelta);
        }
        return deltas;
    }

    /**
     * RLE encoding for quantities
     */
    private encodeRLE(values: number[]): Uint8Array {
        const runs: number[] = [];
        let i = 0;

        while (i < values.length) {
            const val = values[i];
            let count = 1;
            while (i + count < values.length && values[i + count] === val && count < 255) {
                count++;
            }
            runs.push(count, val);
            i += count;
        }

        return encodeVarint(runs);
    }

    /**
     * Combine block data into a single buffer
     */
    private combineBlockData(
        timestamps: number[],
        ids: Uint8Array,
        prices: Uint8Array[],
        quantities: Uint8Array[],
        snapshotCount: number,
        itemCount: number
    ): Uint8Array {
        const timestampsEncoded = encodeVarint(timestamps);
        const pricesCombined = this.concatArrays(prices);
        const quantitiesCombined = this.concatArrays(quantities);

        // Header: snapshotCount(2) + itemCount(2) + lengths(4×4)
        const headerSize = 20;
        const totalSize = headerSize + timestampsEncoded.length + ids.length +
            pricesCombined.length + quantitiesCombined.length;

        const buffer = new Uint8Array(totalSize);
        const view = new DataView(buffer.buffer);
        let offset = 0;

        view.setUint16(offset, snapshotCount, true); offset += 2;
        view.setUint16(offset, itemCount, true); offset += 2;
        view.setUint32(offset, timestampsEncoded.length, true); offset += 4;
        view.setUint32(offset, ids.length, true); offset += 4;
        view.setUint32(offset, pricesCombined.length, true); offset += 4;
        view.setUint32(offset, quantitiesCombined.length, true); offset += 4;

        buffer.set(timestampsEncoded, offset); offset += timestampsEncoded.length;
        buffer.set(ids, offset); offset += ids.length;
        buffer.set(pricesCombined, offset); offset += pricesCombined.length;
        buffer.set(quantitiesCombined, offset);

        return buffer;
    }

    /**
     * Concatenate multiple Uint8Arrays
     */
    private concatArrays(arrays: Uint8Array[]): Uint8Array {
        const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    /**
     * Finalize and get the complete GICS file
     */
    async finish(): Promise<Uint8Array> {
        // Flush any remaining snapshots
        if (this.snapshots.length > 0) {
            await this.flushBlock();
        }

        // Build file structure
        const temporalIndexData = this.encodeTemporalIndex();
        const itemIndexData = this.encodeItemIndex();
        const blocksData = this.concatArrays(this.blocks);

        // Calculate offsets
        const headerSize = 36; // MAGIC(4) + VERSION(1) + FLAGS(1) + BLOCK_COUNT(2) + ITEM_COUNT(4) + offsets(24)
        const temporalIndexOffset = headerSize;
        const itemIndexOffset = temporalIndexOffset + temporalIndexData.length;
        const dataOffset = itemIndexOffset + itemIndexData.length;

        // Build file
        const totalSize = dataOffset + blocksData.length + 4; // +4 for CRC32
        const buffer = new Uint8Array(totalSize);
        const view = new DataView(buffer.buffer);
        let offset = 0;

        // Header
        buffer.set(MAGIC, offset); offset += 4;
        buffer[offset++] = VERSION;
        buffer[offset++] = 0x00; // FLAGS
        view.setUint16(offset, this.blocks.length, true); offset += 2;
        view.setUint32(offset, this.itemIndex.size, true); offset += 4;

        // Offsets (as 64-bit, but we use 32-bit for simplicity since files are <4GB)
        view.setUint32(offset, temporalIndexOffset, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4; // High 32 bits
        view.setUint32(offset, itemIndexOffset, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, dataOffset, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;

        // Data sections
        buffer.set(temporalIndexData, temporalIndexOffset);
        buffer.set(itemIndexData, itemIndexOffset);
        buffer.set(blocksData, dataOffset);

        // Calculate CRC32 of all data except the CRC field itself
        const dataToCheck = buffer.slice(0, totalSize - 4);
        const checksum = crc32(dataToCheck);
        view.setUint32(totalSize - 4, checksum, true);

        return buffer;
    }

    /**
     * Encode temporal index
     */
    private encodeTemporalIndex(): Uint8Array {
        const entrySize = 10; // blockId(2) + timestamp(4) + offset(4)
        const buffer = new Uint8Array(this.temporalIndex.length * entrySize);
        const view = new DataView(buffer.buffer);

        let offset = 0;
        for (const entry of this.temporalIndex) {
            view.setUint16(offset, entry.blockId, true); offset += 2;
            view.setUint32(offset, entry.startTimestamp, true); offset += 4;
            view.setUint32(offset, entry.offset, true); offset += 4;
        }

        return buffer;
    }

    /**
     * Encode item index
     */
    private encodeItemIndex(): Uint8Array {
        const entries: number[] = [];

        for (const [itemId, entry] of this.itemIndex) {
            entries.push(itemId);
            entries.push(entry.tier === 'hot' ? 0 : entry.tier === 'warm' ? 1 : 2);
            entries.push(entry.blockPositions.size);

            for (const [blockId, pos] of entry.blockPositions) {
                entries.push(blockId);
                entries.push(pos);
            }
        }

        return encodeVarint(entries);
    }

    /**
     * Get compression statistics
     */
    getStats(): GICSStats {
        const rawSize = this.calculateRawSize();
        const compressedSize = this.blocks.reduce((sum, b) => sum + b.length, 0);

        return {
            snapshotCount: this.temporalIndex.reduce((sum, e) => sum + 1, 0) *
                this.config.blockDurationDays * HOURS_PER_DAY,
            itemCount: this.itemIndex.size,
            rawSizeBytes: rawSize,
            compressedSizeBytes: compressedSize,
            compressionRatio: rawSize / (compressedSize || 1),
            avgChangeRate: 0, // TODO: calculate from tier distribution
            dateRange: {
                start: new Date((this.temporalIndex[0]?.startTimestamp ?? 0) * 1000),
                end: new Date((this.temporalIndex[this.temporalIndex.length - 1]?.startTimestamp ?? 0) * 1000)
            }
        };
    }

    private calculateRawSize(): number {
        // Estimate: items × snapshots × (4 bytes ID + 4 bytes price + 2 bytes qty)
        return this.itemIndex.size *
            this.temporalIndex.length * this.config.blockDurationDays * HOURS_PER_DAY *
            10;
    }
}

// ============================================================================
// Hybrid Reader
// ============================================================================

export interface HybridReaderOptions {
    /** If true, skip corrupted blocks instead of throwing (default: false) */
    salvageMode?: boolean;
}

export class HybridReader {
    private buffer: Uint8Array;
    private view: DataView;
    private temporalIndex: TemporalIndexEntry[] = [];
    private itemIndex: Map<number, ItemIndexEntry> = new Map();
    private dataOffset: number = 0;
    private blockCount: number = 0;
    private salvageMode: boolean;
    private corruptedBlocks: number[] = [];

    constructor(data: Uint8Array, options?: HybridReaderOptions) {
        this.buffer = data;
        this.view = new DataView(data.buffer, data.byteOffset);
        this.salvageMode = options?.salvageMode ?? false;
        this.parseHeader();
    }

    /**
     * Get list of corrupted block IDs (only in salvage mode)
     */
    getCorruptedBlocks(): number[] {
        return [...this.corruptedBlocks];
    }

    /**
     * Check if file has any corruption
     */
    hasCorruption(): boolean {
        return this.corruptedBlocks.length > 0;
    }

    /**
     * Parse file header and indexes
     */
    private parseHeader(): void {
        // Verify minimum size
        if (this.buffer.length < 40) {
            throw new Error('GICS file too small: corrupted or truncated');
        }

        // Verify magic
        const magicBytes = this.buffer.slice(0, 4);
        if (magicBytes[0] !== 0x47 || magicBytes[1] !== 0x49 || magicBytes[2] !== 0x43 || magicBytes[3] !== 0x53) {
            throw new Error('Invalid GICS file format (Magic bytes mismatch)');
        }

        const version = this.view.getUint8(4);
        if (version < MIN_SUPPORTED_VERSION || version > VERSION) {
            if (!this.salvageMode) {
                throw new VersionMismatchError(version, MIN_SUPPORTED_VERSION);
            }
            console.warn(`Version mismatch warning (File: ${version}, System: ${VERSION}). Proceeding in salvage mode.`);
        }

        // Verify CRC32 checksum
        const storedCrc = this.view.getUint32(this.buffer.length - 4, true);
        const dataToCheck = this.buffer.slice(0, this.buffer.length - 4);
        const computedCrc = crc32(dataToCheck);

        if (storedCrc !== computedCrc) {
            throw new Error(
                `GICS file corrupted: CRC32 mismatch (stored: ${storedCrc.toString(16)}, computed: ${computedCrc.toString(16)})`
            );
        }

        // Read header
        this.blockCount = this.view.getUint16(6, true);
        const itemCount = this.view.getUint32(8, true);

        const temporalIndexOffset = this.view.getUint32(12, true);
        const itemIndexOffset = this.view.getUint32(20, true);
        this.dataOffset = this.view.getUint32(28, true);

        // Parse temporal index
        this.parseTemporalIndex(temporalIndexOffset, this.blockCount);

        // Parse item index
        this.parseItemIndex(itemIndexOffset, itemCount);
    }

    private parseTemporalIndex(offset: number, count: number): void {
        const entrySize = 10;
        for (let i = 0; i < count; i++) {
            const entryOffset = offset + i * entrySize;
            this.temporalIndex.push({
                blockId: this.view.getUint16(entryOffset, true),
                startTimestamp: this.view.getUint32(entryOffset + 2, true),
                offset: this.view.getUint32(entryOffset + 6, true)
            });
        }
    }

    private parseItemIndex(offset: number, _count: number): void {
        const indexData = this.buffer.slice(offset, this.dataOffset);
        const values = decodeVarint(indexData);

        let i = 0;
        while (i < values.length) {
            const itemId = values[i++];
            const tierCode = values[i++];
            const blockCount = values[i++];

            const tier: ItemTier = tierCode === 0 ? 'hot' : tierCode === 1 ? 'warm' : 'cold';
            const blockPositions = new Map<number, number>();

            for (let j = 0; j < blockCount; j++) {
                const blockId = values[i++];
                const pos = values[i++];
                blockPositions.set(blockId, pos);
            }

            this.itemIndex.set(itemId, { itemId, tier, blockPositions });
        }
    }

    /**
     * Query history for specific items
     */
    async queryItems(filter: QueryFilter): Promise<ItemQueryResult[]> {
        const results: ItemQueryResult[] = [];
        const targetIds = filter.itemIds ?? Array.from(this.itemIndex.keys());

        for (const itemId of targetIds) {
            const entry = this.itemIndex.get(itemId);
            if (!entry) continue;

            const history: PricePoint[] = [];

            for (const [blockId, _position] of entry.blockPositions) {
                const blockEntry = this.temporalIndex[blockId];
                if (!blockEntry) continue;

                // Check time range (legacy)
                if (filter.startTime && blockEntry.startTimestamp < filter.startTime &&
                    (this.temporalIndex[blockId + 1]?.startTimestamp ?? Infinity) < filter.startTime) continue;
                if (filter.endTime && blockEntry.startTimestamp > filter.endTime) continue;

                // Check sparse time ranges
                if (filter.timeRanges && filter.timeRanges.length > 0) {
                    const blockStart = blockEntry.startTimestamp;
                    const blockEnd = this.temporalIndex[blockId + 1]?.startTimestamp ?? Infinity;

                    const overlapsAny = filter.timeRanges.some(range =>
                        Math.max(blockStart, range.start) < Math.min(blockEnd, range.end)
                    );

                    if (!overlapsAny) continue;
                }

                // Decode block and extract item data
                const blockData = await this.decodeBlock(blockId);
                if (!blockData) continue; // Skip corrupted blocks in salvage mode

                const itemPrices = blockData.prices.get(itemId);
                const itemQuantities = blockData.quantities.get(itemId);

                if (itemPrices) {
                    for (let i = 0; i < blockData.timestamps.length; i++) {
                        const timestamp = blockData.timestamps[i];

                        // Check legacy filters
                        if (filter.startTime && timestamp < filter.startTime) continue;
                        if (filter.endTime && timestamp > filter.endTime) continue;

                        // Check sparse ranges
                        if (filter.timeRanges && filter.timeRanges.length > 0) {
                            const inRange = filter.timeRanges.some(range =>
                                timestamp >= range.start && timestamp <= range.end
                            );
                            if (!inRange) continue;
                        }

                        history.push({
                            timestamp,
                            price: itemPrices[i] ?? 0,
                            quantity: itemQuantities?.[i] ?? 0
                        });
                    }
                }
            }

            // Apply limit
            if (filter.limit && history.length > filter.limit) {
                history.splice(history.length - filter.limit, filter.limit); // Keep latest if limit applied? Usually limit means "latest N" or "first N"? 
                // Existing code was: history.splice(filter.limit); which keeps FIRST N.
                // Usually for history we want LATEST N? 
                // Let's stick to existing behavior for now or check what existing code did.
                // Existing: history.splice(filter.limit); -> Removes elements from index `limit` to end. So keeps first N (oldest).
                // Wait, if history is pushed chronologically, this keeps oldest.
                // If user wants latest, they usually ask for "last 5".
                // Let's assume for now we keep existing behavior: splice(limit) keeps 0..limit-1.
            }

            // Calculate stats
            const stats = this.calculateStats(history);

            results.push({ itemId, history, stats });
        }

        return results;
    }

    /**
     * Decode a single block (v0.4 tiered format)
     */
    private async decodeBlock(blockId: number): Promise<{
        timestamps: number[];
        prices: Map<number, number[]>;
        quantities: Map<number, number[]>;
    } | null> {
        const blockEntry = this.temporalIndex[blockId];
        const nextEntry = this.temporalIndex[blockId + 1];

        const blockStart = this.dataOffset + blockEntry.offset;
        const blockEnd = nextEntry
            ? this.dataOffset + nextEntry.offset
            : this.buffer.length - 4; // -4 for global CRC

        try {
            const compressed = this.buffer.slice(blockStart, blockEnd);
            const decompressedBuf = await decompress(Buffer.from(compressed));
            const decompressed = new Uint8Array(decompressedBuf);
            const view = new DataView(decompressed.buffer);

            // Verify per-block CRC32 (last 4 bytes of decompressed data)
            const dataLength = decompressed.length - 4;
            const storedBlockCrc = view.getUint32(dataLength, true);
            const blockData = decompressed.slice(0, dataLength);
            const computedBlockCrc = crc32(blockData);

            if (storedBlockCrc !== computedBlockCrc) {
                if (this.salvageMode) {
                    this.corruptedBlocks.push(blockId);
                    console.warn(`[GICS Salvage] Block ${blockId} corrupted, skipping`);
                    return null;
                }
                throw new Error(
                    `Block ${blockId} corrupted: CRC32 mismatch (stored: ${storedBlockCrc.toString(16)}, computed: ${computedBlockCrc.toString(16)})`
                );
            }

            // Use verified block data for parsing
            const verifiedView = new DataView(blockData.buffer, blockData.byteOffset);

            // Parse 48-byte header
            let offset = 0;
            const snapshotCount = verifiedView.getUint16(offset, true); offset += 2;
            const totalItemCount = verifiedView.getUint16(offset, true); offset += 2;
            const hotCount = verifiedView.getUint16(offset, true); offset += 2;
            const warmCount = verifiedView.getUint16(offset, true); offset += 2;
            const coldConstantCount = verifiedView.getUint16(offset, true); offset += 2;
            const coldVariableCount = verifiedView.getUint16(offset, true); offset += 2;

            const timestampsLen = verifiedView.getUint32(offset, true); offset += 4;
            const idsLen = verifiedView.getUint32(offset, true); offset += 4;
            const hotEncodedLen = verifiedView.getUint32(offset, true); offset += 4;
            const warmBitmapLen = verifiedView.getUint32(offset, true); offset += 4;
            const warmValuesLen = verifiedView.getUint32(offset, true); offset += 4;
            const coldConstantsLen = verifiedView.getUint32(offset, true); offset += 4;
            const coldVariableBitmapLen = verifiedView.getUint32(offset, true); offset += 4;
            const coldVariableValuesLen = verifiedView.getUint32(offset, true); offset += 4;
            const quantitiesLen = verifiedView.getUint32(offset, true); offset += 4;

            // Decode timestamps (DoD)
            const timestampsData = blockData.slice(offset, offset + timestampsLen);
            offset += timestampsLen;
            const timestamps = this.decodeDoD(decodeVarint(timestampsData));

            // Decode item IDs (delta) - ordered as [hot, warm, cold]
            const idsData = blockData.slice(offset, offset + idsLen);
            offset += idsLen;
            const idDeltas = decodeVarint(idsData);
            const allItemIds: number[] = [];
            if (idDeltas.length > 0) {
                allItemIds.push(idDeltas[0]);
                for (let i = 1; i < idDeltas.length; i++) {
                    allItemIds.push(allItemIds[i - 1] + idDeltas[i]);
                }
            }

            // Split IDs by tier
            const hotIds = allItemIds.slice(0, hotCount);
            const warmIds = allItemIds.slice(hotCount, hotCount + warmCount);
            const coldIds = allItemIds.slice(hotCount + warmCount);

            const prices = new Map<number, number[]>();

            // Decode HOT prices (DoD per item)
            const hotData = blockData.slice(offset, offset + hotEncodedLen);
            offset += hotEncodedLen;
            const hotDoD = decodeVarint(hotData);
            let hotIdx = 0;
            for (const itemId of hotIds) {
                const itemDoD: number[] = [];
                for (let i = 0; i < snapshotCount && hotIdx < hotDoD.length; i++) {
                    itemDoD.push(hotDoD[hotIdx++]);
                }
                prices.set(itemId, this.decodeDoD(itemDoD));
            }

            // Decode WARM prices (bitmap + deltas)
            const warmBitmapData = blockData.slice(offset, offset + warmBitmapLen);
            offset += warmBitmapLen;
            const warmValuesData = blockData.slice(offset, offset + warmValuesLen);
            offset += warmValuesLen;
            const warmValues = decodeVarint(warmValuesData);

            const bitmapBytesPerItem = Math.ceil(snapshotCount / 8);
            let warmBitmapOffset = 0;
            let warmValueIdx = 0;

            for (const itemId of warmIds) {
                const bitmap = warmBitmapData.slice(warmBitmapOffset, warmBitmapOffset + bitmapBytesPerItem);
                warmBitmapOffset += bitmapBytesPerItem;

                const itemPrices: number[] = [];
                let currentPrice = warmValues[warmValueIdx++] ?? 0; // First value is absolute
                itemPrices.push(currentPrice);

                for (let i = 1; i < snapshotCount; i++) {
                    const hasChange = (bitmap[Math.floor(i / 8)] & (1 << (i % 8))) !== 0;
                    if (hasChange) {
                        const delta = warmValues[warmValueIdx++] ?? 0;
                        currentPrice += delta;
                    }
                    itemPrices.push(currentPrice);
                }
                prices.set(itemId, itemPrices);
            }

            // Decode COLD prices
            const coldConstantsData = blockData.slice(offset, offset + coldConstantsLen);
            offset += coldConstantsLen;
            const coldConstants = decodeVarint(coldConstantsData);

            // Read COLD variable bitmaps
            const coldVariableBitmapData = blockData.slice(offset, offset + coldVariableBitmapLen);
            offset += coldVariableBitmapLen;

            const coldVariableValuesData = blockData.slice(offset, offset + coldVariableValuesLen);
            offset += coldVariableValuesLen;
            const coldVariableValues = decodeVarint(coldVariableValuesData);

            let coldConstantIdx = 0;
            let coldVariableBitmapOffset = 0;
            let coldVariableValueIdx = 0;
            const coldBitmapBytesPerItem = Math.ceil(snapshotCount / 8);

            for (let ci = 0; ci < coldIds.length; ci++) {
                const itemId = coldIds[ci];

                if (ci < coldConstantCount) {
                    // Constant COLD item
                    const constantValue = coldConstants[coldConstantIdx++] ?? 0;
                    const itemPrices = new Array(snapshotCount).fill(constantValue);
                    prices.set(itemId, itemPrices);
                } else {
                    // Variable COLD item (uses sparse bitmap like WARM)
                    const bitmap = coldVariableBitmapData.slice(
                        coldVariableBitmapOffset,
                        coldVariableBitmapOffset + coldBitmapBytesPerItem
                    );
                    coldVariableBitmapOffset += coldBitmapBytesPerItem;

                    const itemPrices: number[] = [];
                    let currentPrice = coldVariableValues[coldVariableValueIdx++] ?? 0;
                    itemPrices.push(currentPrice);

                    for (let i = 1; i < snapshotCount; i++) {
                        const hasChange = (bitmap[Math.floor(i / 8)] & (1 << (i % 8))) !== 0;
                        if (hasChange) {
                            const delta = coldVariableValues[coldVariableValueIdx++] ?? 0;
                            currentPrice += delta;
                        }
                        itemPrices.push(currentPrice);
                    }
                    prices.set(itemId, itemPrices);
                }
            }

            // Decode quantities (RLE)
            const quantitiesData = blockData.slice(offset, offset + quantitiesLen);
            const quantities = this.decodeQuantitiesMatrix(quantitiesData, allItemIds, snapshotCount);

            return { timestamps, prices, quantities };
        } catch (error) {
            if (this.salvageMode) {
                this.corruptedBlocks.push(blockId);
                console.warn(`[GICS Salvage] Block ${blockId} decode failed, skipping`);
                return null;
            }
            throw error;
        }
    }

    /**
     * Decode DoD values
     */
    private decodeDoD(values: number[]): number[] {
        if (values.length === 0) return [];
        if (values.length === 1) return [values[0]];

        const result = [values[0], values[0] + values[1]];
        for (let i = 2; i < values.length; i++) {
            const prevDelta = result[i - 1] - result[i - 2];
            const delta = prevDelta + values[i];
            result.push(result[i - 1] + delta);
        }
        return result;
    }

    /**
     * Decode quantities matrix
     */
    private decodeQuantitiesMatrix(
        data: Uint8Array,
        itemIds: number[],
        snapshotCount: number
    ): Map<number, number[]> {
        const quantities = new Map<number, number[]>();
        const allRuns = decodeVarint(data);

        // Decode RLE
        const allValues: number[] = [];
        for (let i = 0; i < allRuns.length; i += 2) {
            const count = allRuns[i];
            const val = allRuns[i + 1];
            for (let j = 0; j < count; j++) {
                allValues.push(val);
            }
        }

        let idx = 0;
        for (const itemId of itemIds) {
            const itemQty: number[] = [];
            for (let s = 0; s < snapshotCount && idx < allValues.length; s++) {
                itemQty.push(allValues[idx++]);
            }
            quantities.set(itemId, itemQty);
        }

        return quantities;
    }

    /**
     * Calculate statistics for price history
     */
    private calculateStats(history: PricePoint[]): ItemQueryResult['stats'] {
        if (history.length === 0) return undefined;

        const prices = history.map(p => p.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

        // Volatility (standard deviation / mean)
        const variance = prices.reduce((sum, p) => sum + (p - avg) ** 2, 0) / prices.length;
        const volatility = Math.sqrt(variance) / (avg || 1);

        // Trend
        const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
        const secondHalf = prices.slice(Math.floor(prices.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1);
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1);
        const trendPercent = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;

        let trend: 'up' | 'down' | 'stable';
        if (trendPercent > 5) trend = 'up';
        else if (trendPercent < -5) trend = 'down';
        else trend = 'stable';

        return { min, max, avg, volatility, trend, trendPercent };
    }

    /**
     * Get all item IDs in the file
     */
    getItemIds(): number[] {
        return Array.from(this.itemIndex.keys());
    }

    /**
     * Get item tier classification
     */
    getItemTier(itemId: number): ItemTier | undefined {
        return this.itemIndex.get(itemId)?.tier;
    }


    /**
     * Get the most recent snapshot available in the file
     */
    async getLatestSnapshot(): Promise<Snapshot | null> {
        if (this.temporalIndex.length === 0) return null;

        const lastBlockId = this.temporalIndex.length - 1;
        const blockData = await this.decodeBlock(lastBlockId);
        if (!blockData || blockData.timestamps.length === 0) return null;

        const lastTimestamp = blockData.timestamps[blockData.timestamps.length - 1];

        // Reconstruct snapshot for this timestamp
        return this.reconstructSnapshot(blockData, lastTimestamp);
    }

    /**
     * Reconstruct a complete snapshot at a given timestamp
     */
    async getSnapshotAt(timestamp: number): Promise<Snapshot | null> {
        // Find the block containing this timestamp
        let targetBlockId = -1;
        for (let i = 0; i < this.temporalIndex.length; i++) {
            const entry = this.temporalIndex[i];
            const nextEntry = this.temporalIndex[i + 1];

            if (timestamp >= entry.startTimestamp &&
                (!nextEntry || timestamp < nextEntry.startTimestamp)) {
                targetBlockId = i;
                break;
            }
        }

        if (targetBlockId === -1) return null;

        const blockData = await this.decodeBlock(targetBlockId);
        if (!blockData) return null; // Block corrupted in salvage mode

        // Find exact snapshot index OR closest previous one
        let snapIndex = -1;
        for (let i = 0; i < blockData.timestamps.length; i++) {
            if (blockData.timestamps[i] > timestamp) break;
            snapIndex = i;
        }

        if (snapIndex === -1) return null;

        const actualTimestamp = blockData.timestamps[snapIndex];
        return this.reconstructSnapshot(blockData, actualTimestamp);
    }

    private reconstructSnapshot(blockData: any, timestamp: number): Snapshot {
        const snapIndex = blockData.timestamps.indexOf(timestamp);
        const items = new Map<number, { price: number; quantity: number }>();

        // Reconstruct items from this snapshot
        for (const itemId of blockData.prices.keys()) {
            const prices = blockData.prices.get(itemId);
            const quantities = blockData.quantities.get(itemId);

            if (prices && quantities && snapIndex < prices.length) {
                const price = prices[snapIndex];
                const quantity = quantities[snapIndex];
                if (price > 0) {
                    items.set(itemId, { price, quantity });
                }
            }
        }

        return { timestamp, items };
    }
}

// ============================================================================
// ItemQuery - Convenience wrapper for common queries
// ============================================================================

export class ItemQuery {
    private reader: HybridReader;

    constructor(reader: HybridReader) {
        this.reader = reader;
    }

    /**
     * Get history for a single item
     */
    async getItemHistory(itemId: number, startTime?: number, endTime?: number): Promise<ItemQueryResult | null> {
        const results = await this.reader.queryItems({
            itemIds: [itemId],
            startTime,
            endTime
        });
        return results[0] ?? null;
    }

    /**
     * Get history for multiple items
     */
    async getMultipleItemsHistory(
        itemIds: number[],
        startTime?: number,
        endTime?: number
    ): Promise<ItemQueryResult[]> {
        return await this.reader.queryItems({ itemIds, startTime, endTime });
    }

    /**
     * Get all items in a tier
     */
    getItemsByTier(tier: ItemTier): number[] {
        const allIds = this.reader.getItemIds();
        return allIds.filter(id => this.reader.getItemTier(id) === tier);
    }
}

// ============================================================================
// MarketIntelligence - Use compression metadata as market analytics
// ============================================================================

/**
 * Market opportunity derived from compression metadata
 */
export interface MarketOpportunity {
    itemId: number;
    tier: ItemTier;
    /** Current price (most recent) */
    currentPrice: number;
    /** Previous price (for comparison) */
    previousPrice: number;
    /** Price change percentage */
    priceChangePercent: number;
    /** Current quantity in market */
    currentQuantity: number;
    /** Discount score: negative = deal, positive = overpriced */
    discountScore: number;
    /** Activity level: how often this item changes (0-1) */
    activityLevel: number;
    /** Recommendation */
    action: 'buy' | 'sell' | 'craft' | 'hold' | 'watch';
    /** Confidence in recommendation (0-1) */
    confidence: number;
}

/**
 * Market Intelligence - Extract trading insights from compression metadata
 * 
 * The tier classification (HOT/WARM/COLD) that GICS uses for compression
 * directly reflects market activity:
 * - HOT items = High trading activity = Opportunities
 * - Changes in tier = Market shifts
 * - Δprice + quantity = Profitability signal
 */
export class MarketIntelligence {
    private reader: HybridReader;
    private query: ItemQuery;

    constructor(reader: HybridReader) {
        this.reader = reader;
        this.query = new ItemQuery(reader);
    }

    /**
     * Get HOT items with recent activity - the most tradeable items
     */
    getHotItems(): number[] {
        return this.query.getItemsByTier('hot');
    }

    /**
     * Get all market opportunities sorted by potential
     */
    async getOpportunities(options?: {
        /** Filter by tier */
        tier?: ItemTier;
        /** Minimum price change % to consider */
        minPriceChange?: number;
        /** Maximum results */
        limit?: number;
    }): Promise<MarketOpportunity[]> {
        const tier = options?.tier;
        const minChange = options?.minPriceChange ?? 0;
        const limit = options?.limit ?? 50;

        // Get items to analyze
        let itemIds: number[];
        if (tier) {
            itemIds = this.query.getItemsByTier(tier);
        } else {
            // Prioritize HOT items, then WARM
            itemIds = [
                ...this.query.getItemsByTier('hot'),
                ...this.query.getItemsByTier('warm')
            ];
        }

        const opportunities: MarketOpportunity[] = [];

        for (const itemId of itemIds) {
            const result = await this.query.getItemHistory(itemId);
            if (!result || result.history.length < 2) continue;

            const history = result.history;
            const current = history[history.length - 1];
            const previous = history[history.length - 2];
            const itemTier = this.reader.getItemTier(itemId) ?? 'cold';

            // Calculate metrics
            const priceChangePercent = ((current.price - previous.price) / previous.price) * 100;

            if (Math.abs(priceChangePercent) < minChange) continue;

            // Activity level based on tier
            const activityLevel = itemTier === 'hot' ? 0.9 : itemTier === 'warm' ? 0.5 : 0.1;

            // Discount score: negative = below average (good buy), positive = above average
            const avgPrice = result.stats?.avg ?? current.price;
            const discountScore = ((current.price - avgPrice) / avgPrice) * 100;

            // Determine action
            const opportunity = this.analyzeOpportunity(
                current.price,
                previous.price,
                current.quantity ?? 0,
                discountScore,
                activityLevel,
                itemTier
            );

            opportunities.push({
                itemId,
                tier: itemTier,
                currentPrice: current.price,
                previousPrice: previous.price,
                priceChangePercent,
                currentQuantity: current.quantity ?? 0,
                discountScore,
                activityLevel,
                ...opportunity
            });
        }

        // Sort by confidence × activity
        opportunities.sort((a, b) => (b.confidence * b.activityLevel) - (a.confidence * a.activityLevel));

        return opportunities.slice(0, limit);
    }

    /**
     * Analyze an item and recommend action
     */
    private analyzeOpportunity(
        currentPrice: number,
        previousPrice: number,
        quantity: number,
        discountScore: number,
        activityLevel: number,
        tier: ItemTier
    ): { action: MarketOpportunity['action']; confidence: number } {
        const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;

        // High activity + price drop + high quantity = BUY opportunity
        if (activityLevel > 0.5 && priceChange < -5 && discountScore < -10) {
            return { action: 'buy', confidence: Math.min(0.9, activityLevel + Math.abs(discountScore) / 100) };
        }

        // High activity + price surge + low quantity = SELL opportunity
        if (activityLevel > 0.5 && priceChange > 10 && discountScore > 10) {
            return { action: 'sell', confidence: Math.min(0.9, activityLevel + discountScore / 100) };
        }

        // HOT tier + stable price + reasonable discount = CRAFT opportunity
        if (tier === 'hot' && Math.abs(priceChange) < 3 && discountScore < 5) {
            return { action: 'craft', confidence: 0.6 };
        }

        // WARM tier with significant movement = WATCH
        if (tier === 'warm' && Math.abs(priceChange) > 5) {
            return { action: 'watch', confidence: 0.5 };
        }

        // Default: hold
        return { action: 'hold', confidence: 0.3 };
    }

    /**
     * Get quick summary of market state
     */
    async getMarketSummary(): Promise<{
        hotItemCount: number;
        warmItemCount: number;
        coldItemCount: number;
        buyOpportunities: number;
        sellOpportunities: number;
        totalItems: number;
    }> {
        const hot = this.query.getItemsByTier('hot').length;
        const warm = this.query.getItemsByTier('warm').length;
        const cold = this.query.getItemsByTier('cold').length;
        const opportunities = await this.getOpportunities({ limit: 1000 });

        return {
            hotItemCount: hot,
            warmItemCount: warm,
            coldItemCount: cold,
            buyOpportunities: opportunities.filter(o => o.action === 'buy').length,
            sellOpportunities: opportunities.filter(o => o.action === 'sell').length,
            totalItems: hot + warm + cold
        };
    }

    /**
     * Find items that recently changed tier (market shifts)
     * This requires comparing two different GICS files
     */
    static compareMarkets(
        older: HybridReader,
        newer: HybridReader
    ): { itemId: number; oldTier: ItemTier; newTier: ItemTier }[] {
        const changes: { itemId: number; oldTier: ItemTier; newTier: ItemTier }[] = [];

        for (const itemId of newer.getItemIds()) {
            const oldTier = older.getItemTier(itemId);
            const newTier = newer.getItemTier(itemId);

            if (oldTier && newTier && oldTier !== newTier) {
                changes.push({ itemId, oldTier, newTier });
            }
        }

        return changes;
    }
}

