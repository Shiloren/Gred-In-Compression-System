/**
 * GICS Range Reader - HTTP Range Request Support for Partial Downloads
 *
 * @module gics
 * @version 1.1.0
 * @status FROZEN - Canonical implementation
 * @see docs/GICS_V1.1_SPEC.md
 *
 * Enables efficient partial file downloads using HTTP Range Requests.
 * Client can download only the index (~4KB) and specific blocks (~50KB each)
 * instead of the entire file (~2MB+).
 *
 * @author Gred In Labs
 */
import { CompressionAlgorithm } from './gics-types.js';
interface TemporalIndexEntry {
    blockId: number;
    startTimestamp: number;
    offset: number;
}
interface RangeReaderConfig {
    /** Fetch implementation (defaults to global fetch) */
    fetch?: typeof fetch;
    /** Size of footer to fetch for index discovery (default: 4096) */
    footerSize?: number;
}
/**
 * HTTP Range-based GICS reader for efficient partial downloads.
 *
 * Usage:
 * ```typescript
 * const reader = new GICSRangeReader('https://storage.example.com/realm_1403_active.gics');
 *
 * // 1. Fetch just the header to get file layout
 * const header = await reader.fetchHeader();
 *
 * // 2. Fetch the temporal index
 * const index = await reader.fetchTemporalIndex(header);
 *
 * // 3. Find the block containing target timestamp
 * const blockId = reader.findBlockForTimestamp(index, targetTimestamp);
 *
 * // 4. Fetch only that block
 * const blockData = await reader.fetchBlock(blockId, index);
 * ```
 */
export declare class GICSRangeReader {
    private url;
    private config;
    private cachedFileSize?;
    constructor(url: string, config?: RangeReaderConfig);
    /**
     * Fetch the file header (first 36+ bytes)
     * Contains: magic, version, flags, block count, item count, offsets
     */
    fetchHeader(): Promise<{
        version: number;
        compressionAlgorithm: CompressionAlgorithm;
        blockCount: number;
        itemCount: number;
        temporalIndexOffset: number;
        itemIndexOffset: number;
        dataOffset: number;
        fileSize: number;
    }>;
    /**
     * Fetch only the temporal index section
     * @param header Previously fetched header info
     */
    fetchTemporalIndex(header: {
        temporalIndexOffset: number;
        itemIndexOffset: number;
        blockCount: number;
    }): Promise<TemporalIndexEntry[]>;
    /**
     * Find the block ID that contains a given timestamp
     */
    findBlockForTimestamp(index: TemporalIndexEntry[], timestamp: number): number | null;
    /**
     * Fetch a specific block by ID
     * @param blockId Block ID to fetch
     * @param index Temporal index for offset lookup
     * @param header Header info for data offset
     */
    fetchBlock(blockId: number, index: TemporalIndexEntry[], header: {
        dataOffset: number;
    }): Promise<Uint8Array>;
    /**
     * Get estimated download savings compared to full file download
     */
    getDownloadStats(fullFileSize: number, blocksDownloaded: number, avgBlockSize?: number): {
        fullDownload: number;
        partialDownload: number;
        savings: number;
        savingsPercent: number;
    };
}
/**
 * Factory function for convenience
 */
export declare function createRangeReader(url: string, config?: RangeReaderConfig): GICSRangeReader;
export {};
