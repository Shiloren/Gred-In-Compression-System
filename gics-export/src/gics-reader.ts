/**
 * GICS Reader - File I/O for reading GICS format
 * 
 * Handles reading and querying GICS compressed files.
 * Supports selective decompression for efficient queries.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GICSDecoder } from './gics-decoder.js';
import { BlockParser } from './gics-block.js';
import { BlockType } from './gics-types.js';
import type { Snapshot, GICSConfig, GICSHeader, PricePoint, ItemHistory } from './gics-types.js';

// Optional: zstd for decompression (Disabled for lightweight demo)
let zstd: any = null;

const GICS_MAGIC_BYTES = Buffer.from('GICS');

/**
 * Reads GICS compressed files
 */
export class GICSReader {
    private decoder: GICSDecoder;
    private config: Required<GICSConfig>;
    private dataDir: string;

    // Loaded file metadata
    private loadedFiles: Map<string, GICSHeader> = new Map();
    private isLoaded: boolean = false;

    constructor(dataDir: string, config: GICSConfig = {}) {
        this.dataDir = dataDir;
        this.config = {
            dictionary: config.dictionary || new Map(),
            compressionLevel: config.compressionLevel ?? 3,
            chunkSize: config.chunkSize ?? 24,
            enableChecksums: config.enableChecksums ?? true,
            rotationPolicy: config.rotationPolicy ?? 'off'
        };
        this.decoder = new GICSDecoder(this.config);
    }

    /**
     * Load dictionary from file
     */
    loadDictionary(path: string): void {
        if (!existsSync(path)) return;

        const dict = JSON.parse(readFileSync(path, 'utf-8'));
        this.config.dictionary = new Map(Object.entries(dict).map(([k, v]) => [parseInt(k), v as number]));
        this.decoder = new GICSDecoder(this.config);
    }

    /**
     * Load all GICS files from the data directory
     */
    loadAll(): void {
        if (!existsSync(this.dataDir)) {
            console.warn(`[GICS] Data directory not found: ${this.dataDir}`);
            return;
        }

        const files = readdirSync(this.dataDir)
            .filter(f => f.endsWith('.gics'))
            .sort(); // Chronological order

        for (const file of files) {
            try {
                this.loadFile(join(this.dataDir, file));
            } catch (e) {
                console.error(`[GICS] Failed to load ${file}:`, e);
            }
        }

        this.isLoaded = true;
        console.log(`[GICS] Loaded ${this.decoder.getSnapshotCount()} snapshots from ${files.length} files`);
    }

    /**
     * Load a specific GICS file independently (v0.2+ experimental)
     * Can read files in isolation without loading previous months
     */
    loadFileIsolated(filePath: string): void {
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        // Reset decoder to ensure clean state
        this.decoder.clear();

        // Load the file
        this.loadFile(filePath);

        const fileBuffer = readFileSync(filePath);
        const header = this.parseHeader(fileBuffer);

        // Validate it's a v0.2 keyframe file
        if (header.version === 2 && header.snapshotType !== undefined) {
            console.log(`[GICS] Loaded isolated file: ${filePath} (${header.snapshotCount} snapshots)`);
        } else if (header.version === 1) {
            console.warn(`[GICS] Loading legacy v1.0 file in isolated mode may have incomplete data`);
        }
    }

    /**
     * Load a specific GICS file with Block Validation (v1.0 Spec)
     * Implements "Salvage Mode" - reads valid prefix until corruption
     */
    loadFile(filePath: string): void {
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileBuffer = readFileSync(filePath);
        if (fileBuffer.length < 24) {
            throw new Error(`File too short: ${filePath} (${fileBuffer.length} bytes)`);
        }

        // Read header
        const header = this.parseHeader(fileBuffer);
        this.loadedFiles.set(filePath, header);

        // Iterate over blocks
        let offset = 24; // Skip File Header
        const view = new DataView(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
        let previousSnapshot: Snapshot | null = null;
        let blocksRead = 0;

        console.log(`[GICS] Loading blocks from ${filePath} (Size: ${fileBuffer.length})`);

        while (offset < fileBuffer.length) {
            // Check if we have enough bytes for a block header (9 bytes)
            if (offset + 9 > fileBuffer.length) {
                console.warn(`[GICS] Unexpected EOF at offset ${offset}. Stopping (Salvage Mode).`);
                break;
            }

            // 1. Read Block Header
            const blockHeader = BlockParser.readHeader(view, offset);
            const blockSize = 9 + blockHeader.payloadSize;

            // 2. Bounds Check payload
            if (offset + blockSize > fileBuffer.length) {
                console.warn(`[GICS] Block at ${offset} claims size ${blockSize} but file ends at ${fileBuffer.length}. Truncated block. Stopping.`);
                break;
            }

            // 3. Extract Payload
            // Careful with subarray: offset is relative to buffer start
            // view.byteOffset is the offset within the ArrayBuffer
            // We want indices relative to the Uint8Array 'fileBuffer'
            const payload = fileBuffer.subarray(offset + 9, offset + blockSize);

            // 4. Verify Checksum (Ironclad Rule)
            if (this.config.enableChecksums) {
                if (!BlockParser.verify(blockHeader, payload)) {
                    console.error(`[GICS] CRC32 Mismatch at block offset ${offset}. Corruption detected. Stopping (Salvage Mode).`);
                    break; // Stop reading to prevent processing corrupted data
                }
            }

            // 5. Process Block based on Type
            offset += blockSize;
            blocksRead++;

            if (blockHeader.type === BlockType.DATA) {
                // Determine if compressed
                let data = payload;
                // (Zstd logic would go here if enabled)

                // Payload contains one or more snapshots
                let payloadOffset = 0;
                while (payloadOffset < data.length) {
                    try {
                        const { snapshot, bytesRead } = this.decoder.decodeSnapshot(
                            data.subarray(payloadOffset),
                            previousSnapshot
                        );
                        previousSnapshot = snapshot;
                        payloadOffset += bytesRead;
                    } catch (e: any) {
                        console.error(`[GICS] Error decoding snapshot in block at ${offset}: ${e.message}. Skipping remainder of block.`);
                        break;
                    }
                }
            } else if (blockHeader.type === BlockType.INDEX) {
                // Future: Parse TOC
            } else if (blockHeader.type === BlockType.CHECKPOINT) {
                // Future: Load Checkpoint
            } else {
                console.warn(`[GICS] Unknown block type 0x${(blockHeader.type as any).toString(16)} at offset ${offset}. Skipping.`);
            }
        }
    }

    /**
     * Get current price for an item
     */
    getCurrentPrice(itemId: number): number | undefined {
        this.ensureLoaded();
        return this.decoder.getCurrentPrice(itemId);
    }

    /**
     * Get all current prices
     */
    getAllCurrentPrices(): Map<number, { price: number; quantity: number }> {
        this.ensureLoaded();
        return this.decoder.getAllCurrentPrices();
    }

    /**
     * Get full history for an item
     * GICS v0.2 experimental: Optimized to only load files within date range
     */
    getFullHistory(itemId: number, fromDate?: Date, toDate?: Date): PricePoint[] {
        const fromTs = fromDate ? Math.floor(fromDate.getTime() / 1000) : undefined;
        const toTs = toDate ? Math.floor(toDate.getTime() / 1000) : undefined;

        // GICS v0.2 experimental: Load only relevant files
        if (fromDate || toDate) {
            const files = this.getFilesInRange(fromDate, toDate);
            if (files.length > 0) {
                // Clear decoder and load only relevant range
                this.decoder.clear();
                for (const file of files) {
                    try {
                        this.loadFile(file);
                    } catch (e) {
                        console.error(`[GICS] Failed to load ${file}:`, e);
                    }
                }
            }
        } else {
            // No date range specified, ensure all data is loaded
            this.ensureLoaded();
        }

        return this.decoder.getItemHistory(itemId, fromTs, toTs);
    }

    /**
     * Analyze trend for an item
     */
    analyzeTrend(itemId: number, days: number = 7) {
        this.ensureLoaded();
        return this.decoder.analyzeTrend(itemId, days);
    }

    /**
     * Compare two time periods for an item
     */
    compare(
        itemId: number,
        period1: { start: Date; end: Date },
        period2: { start: Date; end: Date }
    ): { avgChange: number; volumeChange: number } | null {
        this.ensureLoaded();

        const history1 = this.getFullHistory(itemId, period1.start, period1.end);
        const history2 = this.getFullHistory(itemId, period2.start, period2.end);

        if (history1.length === 0 || history2.length === 0) return null;

        const avg1 = history1.reduce((sum, p) => sum + p.price, 0) / history1.length;
        const avg2 = history2.reduce((sum, p) => sum + p.price, 0) / history2.length;

        const vol1 = history1.reduce((sum, p) => sum + (p.quantity || 0), 0);
        const vol2 = history2.reduce((sum, p) => sum + (p.quantity || 0), 0);

        return {
            avgChange: ((avg2 - avg1) / avg1) * 100,
            volumeChange: vol1 > 0 ? ((vol2 - vol1) / vol1) * 100 : 0
        };
    }

    /**
     * Get items with significant price changes
     */
    getHotItems(minChangePercent: number = 10, days: number = 1): {
        itemId: number;
        changePercent: number;
        trend: 'up' | 'down';
    }[] {
        this.ensureLoaded();

        const hotItems: { itemId: number; changePercent: number; trend: 'up' | 'down' }[] = [];
        const allPrices = this.getAllCurrentPrices();

        for (const [itemId] of allPrices) {
            const analysis = this.decoder.analyzeTrend(itemId, days);
            if (!analysis) continue;

            if (Math.abs(analysis.changePercent) >= minChangePercent) {
                hotItems.push({
                    itemId,
                    changePercent: analysis.changePercent,
                    trend: analysis.changePercent > 0 ? 'up' : 'down'
                });
            }
        }

        // Sort by absolute change
        hotItems.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

        return hotItems;
    }

    /**
     * Get loaded file count
     */
    getFileCount(): number {
        return this.loadedFiles.size;
    }

    /**
     * Get total snapshot count
     */
    getSnapshotCount(): number {
        return this.decoder.getSnapshotCount();
    }

    // --- Private methods ---

    private ensureLoaded(): void {
        if (!this.isLoaded) {
            this.loadAll();
        }
    }

    /**
     * Get files within date range (v0.2+ experimental optimization)
     */
    private getFilesInRange(fromDate?: Date, toDate?: Date): string[] {
        if (!existsSync(this.dataDir)) {
            return [];
        }

        const allFiles = readdirSync(this.dataDir)
            .filter(f => f.endsWith('.gics'))
            .map(f => join(this.dataDir, f));

        // If no date constraints, return all
        if (!fromDate && !toDate) {
            return allFiles;
        }

        // Extract year-month from filename (e.g., "2025-03.gics")
        const inRange = allFiles.filter(filePath => {
            const filename = filePath.split(/[\\/]/).pop() || '';
            const match = filename.match(/(\d{4})-(\d{2})\.gics$/);

            if (!match) return false;

            const year = parseInt(match[1]);
            const month = parseInt(match[2]);
            const fileDate = new Date(year, month - 1, 1);

            if (fromDate && fileDate < new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)) {
                return false;
            }

            if (toDate && fileDate > new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0)) {
                return false;
            }

            return true;
        });

        return inRange.sort();
    }

    private parseHeader(buffer: Buffer): GICSHeader {
        let offset = 0;

        const magicBuf = buffer.subarray(offset, offset + 4);
        if (!magicBuf.equals(GICS_MAGIC_BYTES)) {
            throw new Error(`Invalid GICS file format: Expected GICS, got ${magicBuf.toString('hex')}`);
        }
        const magic = 'GICS'; offset += 4;
        const version = buffer.readUInt8(offset); offset += 1;
        const yearMonth = buffer.readUIntLE(offset, 3); offset += 3;
        const snapshotCount = buffer.readUInt32LE(offset); offset += 4;
        const itemCount = buffer.readUInt32LE(offset); offset += 4;
        // Skip reserved bytes

        return {
            magic,
            version,
            yearMonth,
            snapshotCount,
            itemCount,
            dictionaryOffset: 0, // Not used in MVP
            dataOffset: 24,
            headerChecksum: 0 // Not used in MVP
        };
    }
}
