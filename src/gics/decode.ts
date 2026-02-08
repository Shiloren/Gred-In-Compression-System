import { Snapshot } from '../gics-types.js';
import { decodeVarint } from '../gics-utils.js';
import { GICS_MAGIC_V2, StreamId, InnerCodecId } from './format.js';
import { ContextV0 } from './context.js';
import { Codecs } from './codecs.js';
import { IncompleteDataError, IntegrityError } from './errors.js';
import { StreamSection } from './stream-section.js';
import { getOuterCodec } from './outer-codecs.js';
import { IntegrityChain } from './integrity.js';
import type { GICSv2DecoderOptions } from './types.js';

export class GICSv2Decoder {
    private readonly data: Uint8Array;
    private pos: number = 0;
    private readonly context: ContextV0;
    private readonly options: Required<GICSv2DecoderOptions>;

    static resetSharedContext() {
        // kept for backward-compat in tests; no-op now
    }

    constructor(data: Uint8Array, options: GICSv2DecoderOptions = {}) {
        this.data = data;
        this.context = new ContextV0('hash_placeholder');
        const defaults: Required<GICSv2DecoderOptions> = {
            integrityMode: 'strict',
            logger: null,
        };
        this.options = { ...defaults, ...options };
    }

    async getAllSnapshots(): Promise<Snapshot[]> {
        if (this.data.length < GICS_MAGIC_V2.length) {
            throw new Error('Data too short');
        }

        let isV2 = true;
        for (let i = 0; i < GICS_MAGIC_V2.length; i++) {
            if (this.data[i] !== GICS_MAGIC_V2[i]) {
                isV2 = false;
                break;
            }
        }

        if (!isV2) {
            throw new IntegrityError("GICS Decoder: Legacy v1.1 format not supported.");
        }

        if (this.data.at(-1) !== 0xFF) {
            throw new IncompleteDataError('GICS: Missing EOS marker (0xFF)');
        }

        this.pos = GICS_MAGIC_V2.length;
        const version = this.getUint8();

        if (version === 0x03) {
            return this.getAllSnapshotsV3();
        } else if (version === 0x02) {
            this.getUint32(); // flags
            return this.getAllSnapshotsV2();
        } else {
            throw new IntegrityError(`Unsupported version: ${version}`);
        }
    }

    private async getAllSnapshotsV3(): Promise<Snapshot[]> {
        this.getUint32(); // flags

        const timeData: number[] = [];
        const snapshotLengths: number[] = [];
        const itemIds: number[] = [];
        const priceData: number[] = [];
        const quantityData: number[] = [];

        const dataEnd = this.data.length - 1;
        const integrity = new IntegrityChain();

        while (this.pos < dataEnd) {
            const section = StreamSection.deserialize(this.data, this.pos);
            this.pos += section.totalSize;

            // Verify integrity
            const manifestBytes = StreamSection.serializeManifest(section.manifest);
            const dataToHash = this.concatArrays([
                new Uint8Array([section.streamId]),
                manifestBytes,
                section.payload
            ]);
            const calculatedHash = integrity.update(dataToHash);

            if (!this.compareHashes(calculatedHash, section.sectionHash)) {
                if (this.options.integrityMode === 'strict') {
                    throw new IntegrityError(`Hash mismatch for stream ${section.streamId}`);
                } else {
                    // Warn mode: log but continue
                    this.options.logger?.warn?.(`WARNING: Hash mismatch for stream ${section.streamId}`);
                }
            }

            const outerCodec = getOuterCodec(section.outerCodecId);
            const decompressed = await outerCodec.decompress(section.payload);

            let blockOffset = 0;
            for (const entry of section.manifest) {
                const blockPayload = decompressed.subarray(blockOffset, blockOffset + entry.payloadLen);
                blockOffset += entry.payloadLen;

                const values = this.decodeBlock(section.streamId, entry.innerCodecId, entry.nItems, blockPayload, entry.flags);

                if (section.streamId === StreamId.TIME) timeData.push(...values);
                else if (section.streamId === StreamId.SNAPSHOT_LEN) snapshotLengths.push(...values);
                else if (section.streamId === StreamId.ITEM_ID) itemIds.push(...values);
                else if (section.streamId === StreamId.VALUE) priceData.push(...values);
                else if (section.streamId === StreamId.QUANTITY) quantityData.push(...values);
            }
        }

        return this.reconstructSnapshots(timeData, snapshotLengths, itemIds, priceData, quantityData);
    }

    private getAllSnapshotsV2(): Snapshot[] {
        let timeData: number[] = [];
        let snapshotLengths: number[] = [];
        let itemIds: number[] = [];
        let priceData: number[] = [];
        let quantityData: number[] = [];

        const dataEnd = this.data.length - 1;

        while (this.pos < dataEnd) {
            const block = this.parseBlockV2(dataEnd);
            if (block.streamId === StreamId.TIME) timeData.push(...block.values);
            else if (block.streamId === StreamId.SNAPSHOT_LEN) snapshotLengths.push(...block.values);
            else if (block.streamId === StreamId.ITEM_ID) itemIds.push(...block.values);
            else if (block.streamId === StreamId.VALUE) priceData.push(...block.values);
            else if (block.streamId === StreamId.QUANTITY) quantityData.push(...block.values);
        }

        return this.reconstructSnapshots(timeData, snapshotLengths, itemIds, priceData, quantityData);
    }

    private parseBlockV2(dataEnd: number) {
        const BLOCK_HEADER_SIZE_V2 = 11;
        if (this.pos + BLOCK_HEADER_SIZE_V2 > dataEnd) {
            throw new IncompleteDataError('GICS: Truncated block header');
        }

        const streamId = this.getUint8();
        const codecId = this.getUint8();
        const nItems = this.getUint32();
        const payloadLen = this.getUint32();
        const blockFlags = this.getUint8();

        const payloadStart = this.pos;
        const payloadEnd = this.pos + payloadLen;
        if (payloadEnd > dataEnd) throw new IncompleteDataError('GICS: Block payload exceeds limit');

        const payload = this.data.subarray(payloadStart, payloadEnd);
        this.pos = payloadEnd;

        const values = this.decodeBlock(streamId, codecId, nItems, payload, blockFlags);
        return { streamId, values };
    }

    private decodeBlock(streamId: StreamId, codecId: InnerCodecId, nItems: number, payload: Uint8Array, blockFlags: number): number[] {
        let values: number[] = [];

        if (codecId === InnerCodecId.VARINT_DELTA || codecId === InnerCodecId.DOD_VARINT) {
            values = decodeVarint(payload);
        } else if (codecId === InnerCodecId.BITPACK_DELTA) {
            values = Codecs.decodeBitPack(payload, nItems);
        } else if (codecId === InnerCodecId.RLE_ZIGZAG || codecId === InnerCodecId.RLE_DOD) {
            values = Codecs.decodeRLE(payload);
        } else if (codecId === InnerCodecId.DICT_VARINT) {
            values = Codecs.decodeDict(payload, this.context);
        } else {
            return [];
        }

        const commitable = (blockFlags & 0x10) === 0;

        if (streamId === StreamId.TIME) {
            return this.decodeTimeStream(values, commitable);
        } else if (streamId === StreamId.VALUE) {
            const isDOD = (codecId === InnerCodecId.DOD_VARINT || codecId === InnerCodecId.RLE_DOD);
            return this.decodeValueStream(values, commitable, isDOD);
        } else {
            return values;
        }
    }

    private reconstructSnapshots(timeData: number[], snapshotLengths: number[], itemIds: number[], priceData: number[], quantityData: number[]): Snapshot[] {
        const result: Snapshot[] = [];

        // Phase 3: No legacy single-item fallback. SNAPSHOT_LEN stream is mandatory in v1.3.
        if (snapshotLengths.length === 0) {
            throw new IntegrityError('GICS v1.3: SNAPSHOT_LEN stream is mandatory');
        }

        let itemOffset = 0;
        for (let s = 0; s < snapshotLengths.length; s++) {
            const count = snapshotLengths[s];
            const map = new Map<number, { price: number; quantity: number }>();
            for (let j = 0; j < count; j++) {
                const id = itemIds[itemOffset] ?? 0;
                const price = priceData[itemOffset] ?? 0;
                const quantity = quantityData[itemOffset] ?? 0;
                map.set(id, { price, quantity });
                itemOffset++;
            }
            result.push({ timestamp: timeData[s] ?? 0, items: map });
        }
        return result;
    }

    private decodeTimeStream(deltas: number[], shouldCommit: boolean): number[] {
        const timestamps: number[] = [];
        let prev = this.context.lastTimestamp ?? 0;
        let prevDelta = this.context.lastTimestampDelta ?? 0;

        for (const deltaOfDelta of deltas) {
            const currentDelta = prevDelta + deltaOfDelta;
            const current = prev + currentDelta;
            timestamps.push(current);
            prev = current;
            prevDelta = currentDelta;
        }

        if (shouldCommit) {
            this.context.lastTimestamp = prev;
            this.context.lastTimestampDelta = prevDelta;
        }
        return timestamps;
    }

    private decodeValueStream(deltas: number[], shouldCommit: boolean, isDOD: boolean = false): number[] {
        const values: number[] = [];
        let prev = this.context.lastValue ?? 0;
        let prevDelta = this.context.lastValueDelta ?? 0;

        for (const rawChange of deltas) {
            let change = rawChange;
            if (isDOD) {
                const currentDelta = prevDelta + change;
                change = currentDelta;
                prevDelta = currentDelta;
            } else {
                prevDelta = change;
            }
            const current = prev + change;
            values.push(current);
            prev = current;
        }

        if (shouldCommit) {
            this.context.lastValue = prev;
            this.context.lastValueDelta = prevDelta;
        }
        return values;
    }

    private getUint8(): number {
        return this.data[this.pos++];
    }

    private getUint32(): number {
        const val = new DataView(this.data.buffer, this.data.byteOffset + this.pos, 4).getUint32(0, true);
        this.pos += 4;
        return val;
    }

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

    private compareHashes(h1: Uint8Array, h2: Uint8Array): boolean {
        if (h1.length !== h2.length) return false;
        for (let i = 0; i < h1.length; i++) {
            if (h1[i] !== h2[i]) return false;
        }
        return true;
    }
}
