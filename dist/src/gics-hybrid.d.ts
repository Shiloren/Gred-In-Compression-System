/**
 * GICS v1.1 - Hybrid Storage Engine
 *
 * @module gics
 * @version 1.1.0
 * @status FROZEN - Canonical implementation
 * @see docs/GICS_V1.1_SPEC.md
 *
 * Dual-index architecture for 100× compression with flexible item queries.
 * Maintains complete snapshots while enabling O(1) per-item access.
 *
 * @author Gred In Labs
 */
import { type Snapshot, type GICSStats, type ItemTier, type QueryFilter, type ItemQueryResult, type HeatScoreResult, CompressionAlgorithm } from './gics-types.js';
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
    /** Password for encryption (optional) */
    password?: string;
    /** Compression algorithm (default: BROTLI for backward compatibility) */
    compressionAlgorithm?: CompressionAlgorithm;
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
export declare class VersionMismatchError extends Error {
    constructor(fileVersion: number, minSupported: number);
}
export declare class TierClassifier {
    private hotThreshold;
    private warmThreshold;
    private ultraSparseThreshold;
    constructor(config?: HybridConfig);
    /**
     * Classify item based on change frequency
     */
    classify(changeRate: number): ItemTier;
    /**
     * Analyze snapshots to determine item tiers
     * NEW: Also detects ultra_sparse items (present in <10% of snapshots)
     */
    analyzeSnapshots(snapshots: Snapshot[]): Map<number, ItemTier>;
}
export declare class HybridWriter {
    private config;
    private snapshots;
    private blocks;
    private temporalIndex;
    private itemIndex;
    private tierClassifier;
    private heatClassifier;
    private blockHeatScores;
    private encryptionMode;
    private salt?;
    private fileNonce?;
    private authVerify?;
    private initPromise;
    constructor(config?: HybridConfig);
    /**
     * Compress data using the configured algorithm
     */
    private compressData;
    /**
     * Get the compression algorithm flag for header
     */
    getCompressionAlgorithm(): CompressionAlgorithm;
    private initEncryption;
    /**
     * Smart Append: Recover state from an existing file's raw components.
     * This enables O(1) file updates instead of O(N) full re-processing.
     *
     * Usage:
     * ```typescript
     * const reader = new HybridReader(existingData);
     * const { blocks, temporalIndex, itemIndex } = reader.getRawComponents();
     *
     * const writer = new HybridWriter();
     * writer.recoverState(blocks, temporalIndex, itemIndex);
     * await writer.addSnapshot(newSnapshot);
     * const updatedFile = await writer.finish();
     * ```
     *
     * @param blocks Raw compressed blocks (not decompressed)
     * @param temporalIndex Temporal index entries from existing file
     * @param itemIndex Item index from existing file
     * @param compressionAlgorithm Compression algorithm from existing file (optional, defaults to current config)
     */
    recoverState(blocks: Uint8Array[], temporalIndex: TemporalIndexEntry[], itemIndex: Map<number, ItemIndexEntry>, compressionAlgorithm?: CompressionAlgorithm): void;
    /**
     * Add a snapshot to the current block
     */
    addSnapshot(snapshot: Snapshot): Promise<void>;
    /**
     * Flush current snapshots to a compressed block
     */
    private flushBlock;
    /**
     * Get heat scores for a specific block (v1.1)
     */
    getBlockHeatScores(blockId: number): Map<number, HeatScoreResult> | undefined;
    /**
     * Get all heat scores across all blocks (v1.1)
     */
    getAllHeatScores(): Map<number, Map<number, HeatScoreResult>>;
    /**
     * Encode a block of snapshots with tiered compression
     * KEY OPTIMIZATION: Separate tiers and compress each optimally
     */
    private encodeBlock;
    /**
     * Delta-of-delta encoding
     */
    private encodeDoD;
    /**
     * RLE encoding for quantities
     */
    private encodeRLE;
    /**
     * Combine block data into a single buffer
     */
    private combineBlockData;
    /**
     * Concatenate multiple Uint8Arrays
     */
    private concatArrays;
    /**
     * Finalize and get the complete GICS file
     */
    finish(): Promise<Uint8Array>;
    /**
     * @internal TEST ONLY - Not part of public API.
     * Finish and return layout info for precise corruption testing.
     */
    finishWithLayout__debug(): Promise<{
        bytes: Uint8Array;
        layout: {
            dataOffset: number;
            blocks: Array<{
                start: number;
                payloadStart: number;
                payloadLen: number;
            }>;
        };
    }>;
    /**
     * Encode temporal index
     */
    private encodeTemporalIndex;
    /**
     * Encode item index
     */
    private encodeItemIndex;
    /**
     * Get compression statistics
     */
    getStats(): GICSStats;
    private calculateRawSize;
}
export declare class HybridReader {
    private buffer;
    private view;
    private header;
    private temporalIndex;
    private itemIndex;
    private encryptionMode;
    private compressionAlgorithm;
    private config;
    constructor(data: Uint8Array, config?: {
        salvageMode?: boolean;
    });
    private parseFileStructure;
    getItemIds(): number[];
    /**
     * Get the compression algorithm used in this file
     */
    getCompressionAlgorithm(): CompressionAlgorithm;
    /**
     * Extract raw components for Smart Append (O(1) updates).
     * Returns blocks without decompression and indexes for reuse.
     *
     * @returns Raw blocks, temporal index, and item index for writer recovery
     */
    getRawComponents(): {
        blocks: Uint8Array[];
        temporalIndex: TemporalIndexEntry[];
        itemIndex: Map<number, ItemIndexEntry>;
        compressionAlgorithm: CompressionAlgorithm;
    };
    queryItems(filter: QueryFilter): Promise<ItemQueryResult[]>;
    private parseBlockContent;
    unlock(password: string): Promise<void>;
    getLatestSnapshot(): Promise<Snapshot | null>;
    /**
     * Get a snapshot at a specific timestamp.
     * Returns null if no matching data is found.
     * Uses queryItems internally for CRC validation.
     */
    getSnapshotAt(timestamp: number): Promise<Snapshot | null>;
    /**
     * Get the tier classification for an item.
     */
    getItemTier(itemId: number): ItemTier | undefined;
    /**
     * Extract ALL snapshots from the GICS file.
     * Used for Download-Merge-Upload consolidation.
     * Reconstructs snapshots from item history data.
     *
     * OPTIMIZED: O(n) using parallel iteration instead of O(n²) .find()
     */
    getAllSnapshots(): Promise<Snapshot[]>;
}
export declare class ItemQuery {
    private reader;
    constructor(reader: HybridReader);
    /**
     * Get the price history for a specific item.
     * Returns null if the item is not found.
     */
    getItemHistory(itemId: number): ItemQueryResult | null;
}
export declare class MarketIntelligence {
    private reader;
    constructor(reader: HybridReader);
}
export {};
