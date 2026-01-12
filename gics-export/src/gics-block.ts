/**
 * GICS Block Logic
 * 
 * Handles the construction and parsing of blocks according to GICS v1.0 Spec.
 * Includes CRC32 implementation for data integrity.
 */

import { BlockType, type GICSBlock, type GICSBlockHeader } from './gics-types.js';

// Pre-calculated CRC32 table (standard polynomial 0xEDB88320)
const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c;
}

/**
 * Calculate CRC32 checksum for a buffer
 */
export function crc32(buffer: Uint8Array): number {
    let crc = -1; // 0xFFFFFFFF
    for (let i = 0; i < buffer.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0; // Ensure unsigned 32-bit integer
}

/**
 * Builder class for creating blocks
 */
export class BlockBuilder {
    /**
     * Create a binary block from payload and type
     */
    static create(type: BlockType, payload: Uint8Array): Uint8Array {
        const crc = crc32(payload);
        const headerSize = 9; // 1 (type) + 4 (size) + 4 (crc)
        const totalSize = headerSize + payload.length;

        const block = new Uint8Array(totalSize);
        const view = new DataView(block.buffer);

        // Write Header
        view.setUint8(0, type);
        view.setUint32(1, payload.length, true); // LE
        view.setUint32(5, crc, true); // LE

        // Write Payload
        block.set(payload, 9);

        return block;
    }
}

/**
 * Parser class for reading blocks
 */
export class BlockParser {
    /**
     * Read header from buffer at offset
     */
    static readHeader(view: DataView, offset: number): GICSBlockHeader {
        // Bounds check must be done by caller (needs 9 bytes)
        const type = view.getUint8(offset) as BlockType;
        const payloadSize = view.getUint32(offset + 1, true);
        const crc32 = view.getUint32(offset + 5, true);

        return { type, payloadSize, crc32 };
    }

    /**
     * Verify block integrity
     */
    static verify(header: GICSBlockHeader, payload: Uint8Array): boolean {
        if (payload.length !== header.payloadSize) return false;
        const calculated = crc32(payload);
        return calculated === header.crc32;
    }
}
