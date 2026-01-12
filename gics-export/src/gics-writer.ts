/**
 * GICS Writer - File I/O for GICS format
 * 
 * Handles writing GICS compressed data to files.
 * Supports streaming append for real-time collection.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, openSync, closeSync, readSync, writeSync, appendFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { GICSEncoder } from './gics-encoder.js';
import type { Snapshot, GICSConfig, GICSHeader, GICSStats } from './gics-types.js';
import { BlockType } from './gics-types.js';
import { BlockBuilder } from './gics-block.js';

// Optional: zstd for final compression (can work without it)
let zstd: any = null;
try {
    // Dynamic import to avoid hard dependency
    // zstd = require('@aspect/zstd'); // Commented out to avoid ESM issues for now
} catch {
    // zstd not available, use raw encoding
}

const GICS_MAGIC = Buffer.from('GICS');
const GICS_VERSION = 1;

/**
 * Writes GICS compressed files
 */
export class GICSWriter {
    private encoder: GICSEncoder;
    private config: Required<GICSConfig>;
    private outputDir: string;

    // Current file state
    private currentMonth: string = '';
    private currentFilePath: string = '';
    private chunks: Uint8Array[] = [];
    private snapshotCount: number = 0;
    private itemCount: number = 0;
    private isAppending: boolean = false;

    constructor(outputDir: string, config: GICSConfig = {}) {
        this.outputDir = outputDir;
        this.config = {
            dictionary: config.dictionary || new Map(),
            compressionLevel: config.compressionLevel ?? 3,
            chunkSize: config.chunkSize ?? 24,
            enableChecksums: config.enableChecksums ?? true,
            rotationPolicy: config.rotationPolicy ?? 'off' // v0.2 experimental: default to legacy mode
        };
        this.encoder = new GICSEncoder(this.config);

        // Ensure output dir exists
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
    }

    /**
     * Add a new snapshot (automatically handles file rotation)
     */
    addSnapshot(snapshot: Snapshot): void {
        // CRITICAL FIX: Initialize file on first snapshot if not already done
        if (!this.currentFilePath) {
            const month = this.getMonthKey(snapshot.timestamp);
            this.startNewFile(month);
        }

        // GICS v0.2 experimental: Check if rotation is needed
        const shouldRotate = this.shouldRotateFile(snapshot.timestamp);

        if (shouldRotate) {
            if (this.currentMonth) {
                this.flush(); // Seal current file
            }
            const month = this.getMonthKey(snapshot.timestamp);
            this.startNewFile(month);

            // CRITICAL: Write KEYFRAME as first snapshot in new file
            // This makes the file self-contained (no dependency on previous files)
            const keyframe = this.encoder.encodeSnapshot(snapshot, true); // forceAbsolute=true
            this.chunks.push(keyframe);
            this.snapshotCount++;
            this.itemCount = Math.max(this.itemCount, snapshot.items.size);
            console.log(`[GICS] Wrote keyframe to new file (${snapshot.items.size} items)`);
        } else {
            // Normal delta encoding
            const encoded = this.encoder.encodeSnapshot(snapshot, false);
            this.chunks.push(encoded);
            this.snapshotCount++;
            this.itemCount = Math.max(this.itemCount, snapshot.items.size);
        }

        // Auto-flush every chunkSize snapshots
        if (this.chunks.length >= this.config.chunkSize) {
            this.flush();
        }
    }

    /**
     * Flush current data to disk
     */
    flush(): void {
        if (this.chunks.length === 0) return;

        // Combine all chunks into one payload
        const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of this.chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        // Apply final compression if zstd available
        let payload: Uint8Array;
        if (zstd) {
            const compressed = zstd.compressSync(Buffer.from(combined), this.config.compressionLevel);
            payload = new Uint8Array(compressed);
        } else {
            payload = combined;
        }

        // Wrap in GICS Block
        const block = BlockBuilder.create(BlockType.DATA, payload);

        // Build file
        let bytesWritten = 0;

        if (this.snapshotCount <= this.chunks.length) {
            // New file or fully rewritten, include header
            if (!this.isAppending || !existsSync(this.currentFilePath)) {
                const header = this.buildHeader();
                const content = Buffer.concat([header, block]);
                writeFileSync(this.currentFilePath, content);
                this.isAppending = true;
                bytesWritten = content.length;
            } else {
                // Resuming implies we just append blocks, but we must update main header counts
                const fd = openSync(this.currentFilePath, 'r+');
                const headerUpdate = Buffer.alloc(8);
                headerUpdate.writeUInt32LE(this.snapshotCount, 0); // Update snapshot count
                headerUpdate.writeUInt32LE(this.itemCount, 4);     // Update item count
                writeSync(fd, headerUpdate, 0, 8, 8); // Offset 8
                closeSync(fd);

                appendFileSync(this.currentFilePath, block);
                bytesWritten = block.length;
            }
        } else {
            // Appending to existing file
            const fd = openSync(this.currentFilePath, 'r+');
            // Update header
            const headerUpdate = Buffer.alloc(8);
            headerUpdate.writeUInt32LE(this.snapshotCount, 0);
            headerUpdate.writeUInt32LE(this.itemCount, 4);
            writeSync(fd, headerUpdate, 0, 8, 8);
            closeSync(fd);

            // Append data block
            appendFileSync(this.currentFilePath, block);
            bytesWritten = block.length;
        }

        console.log(`[GICS] Wrote block to ${this.currentFilePath} (${(bytesWritten / 1024).toFixed(1)} KB)`);

        // Write sidecar for resumption
        const lastSnapshot = this.encoder.getPreviousSnapshot();
        if (lastSnapshot) {
            const sidecarData = {
                timestamp: lastSnapshot.timestamp,
                items: Array.from(lastSnapshot.items.entries())
            };
            // ROBUSTNESS: Atomic write pattern
            const tempPath = this.currentFilePath + '.last.tmp';
            const finalPath = this.currentFilePath + '.last';
            try {
                writeFileSync(tempPath, JSON.stringify(sidecarData));
                renameSync(tempPath, finalPath);
            } catch (err) {
                console.warn(`[GICS] Failed to save sidecar atomically: ${err}`);
            }
        }

        // Reset chunks
        this.chunks = [];
    }

    /**
     * Force save and close
     */
    close(): void {
        this.flush();
        this.encoder.reset();
        this.currentMonth = '';
    }

    /**
     * Get compression statistics
     */
    getStats(): GICSStats & { encoderStats: ReturnType<GICSEncoder['getStats']> } {
        const encoderStats = this.encoder.getStats();

        // Estimate raw size
        const rawSize = this.snapshotCount * this.itemCount * 12; // 12 bytes per item estimate
        const compressedSize = this.chunks.reduce((sum, c) => sum + c.length, 0);

        return {
            snapshotCount: this.snapshotCount,
            itemCount: this.itemCount,
            rawSizeBytes: rawSize,
            compressedSizeBytes: compressedSize,
            compressionRatio: rawSize / (compressedSize || 1),
            avgChangeRate: 100 - encoderStats.unchangedPercent,
            dateRange: { start: new Date(), end: new Date() }, // Placeholder
            encoderStats
        };
    }

    /**
     * Check if file rotation is needed (v0.2+ experimental)
     */
    private shouldRotateFile(timestamp: number): boolean {
        if (this.config.rotationPolicy === 'off') {
            return false; // Legacy mode: single file
        }

        const month = this.getMonthKey(timestamp);

        // Rotate if month changed or no file open yet
        if (!this.currentMonth) {
            return true; // First file
        }

        switch (this.config.rotationPolicy) {
            case 'monthly':
                return month !== this.currentMonth;
            case 'weekly':
                // Implement weekly logic if needed
                return month !== this.currentMonth; // Fallback to monthly
            case 'daily':
                // Implement daily logic if needed
                return month !== this.currentMonth; // Fallback to monthly
            case 'size-based':
                // Could check file size here
                return false;
            default:
                return false;
        }
    }

    /**
     * Save dictionary to file for decoding
     */
    saveDictionary(path: string): void {
        const dict: Record<number, number> = {};
        for (const [itemId, index] of this.config.dictionary) {
            dict[itemId] = index;
        }
        writeFileSync(path, JSON.stringify(dict, null, 2));
    }

    // --- Private methods ---

    private getMonthKey(timestamp: number): string {
        const date = new Date(timestamp * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    private startNewFile(month: string): void {
        this.currentMonth = month;
        this.currentFilePath = join(this.outputDir, `${month}.gics`);
        this.chunks = [];
        this.snapshotCount = 0;

        // Check if file exists (resume mode)
        if (existsSync(this.currentFilePath)) {
            console.log(`[GICS] Resuming file ${this.currentFilePath}`);
            this.isAppending = true;

            // Read header to resume counts
            const fd = openSync(this.currentFilePath, 'r');
            const header = Buffer.alloc(24);
            readSync(fd, header, 0, 24, 0);
            closeSync(fd);

            // Offset 8: Snapshot Count (4), Item Count (4)
            this.snapshotCount = header.readUInt32LE(8);
            this.itemCount = header.readUInt32LE(12);

            // Load last snapshot from sidecar (Pragmatic Patch)
            try {
                if (existsSync(this.currentFilePath + '.last')) {
                    const lastData = JSON.parse(readFileSync(this.currentFilePath + '.last', 'utf-8'));
                    // Reconstruct snapshot
                    const map = new Map();
                    // items is stored as [key, value][] entries
                    for (const [k, v] of lastData.items) {
                        map.set(Number(k), v);
                    }
                    this.encoder.setPreviousSnapshot({
                        timestamp: lastData.timestamp || 0,
                        items: map
                    });
                    console.log(`[GICS] Loaded previous state from sidecar`);
                } else {
                    console.warn("[GICS] Sidecar file not found, creating fresh reference (deltas may be larger until next snapshot)");
                    this.encoder.reset();
                }
            } catch (e) {
                console.warn("[GICS] Failed to load previous state:", e);
                this.encoder.reset();
            }

        } else {
            console.log(`[GICS] Starting new file ${this.currentFilePath}`);
            // GICS v0.2 experimental: Reset encoder to break dependency chain
            // This ensures the first snapshot will be a keyframe
            this.encoder.reset();
            this.isAppending = false;
        }
    }

    private buildHeader(): Buffer {
        const header = Buffer.alloc(24);
        let offset = 0;

        // Magic (4 bytes)
        GICS_MAGIC.copy(header, offset); offset += 4;

        // Version (1 byte) - Use v0.2 if rotation enabled (experimental)
        const version = this.config.rotationPolicy !== 'off' ? 2 : GICS_VERSION;
        header.writeUInt8(version, offset); offset += 1;

        // Year-Month as YYYYMM (3 bytes)
        const yearMonth = parseInt(this.currentMonth.replace('-', ''));
        header.writeUIntLE(yearMonth, offset, 3); offset += 3;

        // Snapshot count (4 bytes)
        header.writeUInt32LE(this.snapshotCount, offset); offset += 4;

        // Item count (4 bytes)
        header.writeUInt32LE(this.itemCount, offset); offset += 4;

        // Reserved (8 bytes for future use)
        // Byte 16: Flags (bit 0 = hasKeyframe)
        if (version === 2 && this.snapshotCount > 0) {
            header.writeUInt8(0x01, 16); // hasKeyframe flag
        }
        offset += 8;

        return header;
    }
}
