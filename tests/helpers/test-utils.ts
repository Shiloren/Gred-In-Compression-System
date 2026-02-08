import { Snapshot } from '../../src/gics-types.js';
import { SegmentHeader } from '../../src/gics/segment.js';
import { StreamSection } from '../../src/gics/stream-section.js';


export function createSnapshot(timestamp: number, itemId: number, price: number, quantity: number): Snapshot {
    return {
        timestamp,
        items: new Map([[itemId, { price, quantity }]])
    };
}

export function createSnapshots(count: number, startTs: number, itemId: number): Snapshot[] {
    const snaps: Snapshot[] = [];
    for (let i = 0; i < count; i++) {
        const items = new Map();
        items.set(itemId, { price: 100 + i, quantity: 10 });
        snaps.push({ timestamp: startTs + i * 1000, items });
    }
    return snaps;
}

export interface BlockFlagInfo {
    index: number;
    flags: number;
}

/**
 * Parses a GICS binary buffer and extracts block indices and flags for a specific stream.
 */
export function getBlocksWithFlags(data: Uint8Array, targetStreamId: number): BlockFlagInfo[] {
    const results: BlockFlagInfo[] = [];
    let globalBlockIndex = 0;
    let pos = 14; // GICS_HEADER_SIZE_V3
    const dataEnd = data.length - 37; // FILE_EOS_SIZE

    while (pos < dataEnd) {
        if (isSegmentMagic(data, pos)) {
            const segmentInfo = processSegment(data, pos, targetStreamId, globalBlockIndex, results);
            pos = segmentInfo.nextPos;
            globalBlockIndex = segmentInfo.nextGlobalIndex;
        } else {
            pos++;
        }
    }
    return results;
}

function isSegmentMagic(data: Uint8Array, pos: number): boolean {
    return data[pos] === 0x53 && data[pos + 1] === 0x47; // "SG"
}

function processSegment(
    data: Uint8Array,
    pos: number,
    targetStreamId: number,
    globalBlockIndex: number,
    results: BlockFlagInfo[]
): { nextPos: number; nextGlobalIndex: number } {
    const segmentStart = pos;
    const header = SegmentHeader.deserialize(data.subarray(pos, pos + 14));
    let currentPos = pos + 14;

    const sectionsEnd = segmentStart + header.indexOffset;
    while (currentPos < sectionsEnd) {
        const section = StreamSection.deserialize(data, currentPos);
        if (section.streamId === targetStreamId) {
            for (const entry of section.manifest) {
                globalBlockIndex++;
                if (entry.flags !== 0) {
                    results.push({ index: globalBlockIndex, flags: entry.flags });
                }
            }
        }
        currentPos += section.totalSize;
    }

    // Skip to next segment or EOS
    let nextPos = sectionsEnd;
    const dataEnd = data.length - 37;
    while (nextPos < dataEnd && !isSegmentMagic(data, nextPos)) {
        nextPos++;
    }

    return { nextPos, nextGlobalIndex: globalBlockIndex };
}


