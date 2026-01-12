/**
 * GICS Utilities
 *
 * @module gics
 * @version 1.1.0
 * @status FROZEN - Canonical implementation
 * @see docs/GICS_V1.1_SPEC.md
 *
 * Shared functions for GICS encoding/decoding.
 */
/**
 * Encode integers with zigzag + variable-length encoding
 * Small numbers = 1 byte, larger = 2-5 bytes
 */
export declare function encodeVarint(values: number[]): Uint8Array;
/**
 * Decode zigzag + variable-length integers
 */
export declare function decodeVarint(data: Uint8Array): number[];
/**
 * RLE + Varint encoding: extremely efficient for sparse data with many zeros
 * Format: [run_length][value][run_length][value]...
 * - Run of zeros: encode as [count, 0]
 * - Run of same value: encode as [count, value]
 * - Single values: encode as [1, value]
 */
export declare function encodeRLE(values: number[]): Uint8Array;
/**
 * Decode RLE + Varint
 */
export declare function decodeRLE(data: Uint8Array): number[];
/**
 * Wait for N ms
 */
export declare const wait: (ms: number) => Promise<unknown>;
/**
 * Format bytes to readable string
 */
export declare function formatSize(bytes: number): string;
