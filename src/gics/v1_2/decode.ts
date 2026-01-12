import { Snapshot } from '../../gics-types.js';
import { decodeVarint } from '../../gics-utils.js';
import { GICS_MAGIC_V2, StreamId, CodecId, BLOCK_HEADER_SIZE } from './format.js';
import { gics11_decode } from '../../../gics_frozen/v1_1_0/index.js';
import { ContextV0 } from './context.js';
import { Codecs } from './codecs.js';

export class GICSv2Decoder {
    private data: Uint8Array;
    private pos: number = 0;
    private context: ContextV0;

    private static sharedContext: ContextV0 | null = null;

    static resetSharedContext() {
        GICSv2Decoder.sharedContext = null;
    }



    constructor(data: Uint8Array) {
        this.data = data;

        const mode = process.env.GICS_CONTEXT_MODE || 'on';
        if (mode === 'off') {
            this.context = new ContextV0('hash_placeholder');
        } else {
            if (!GICSv2Decoder.sharedContext) {
                GICSv2Decoder.sharedContext = new ContextV0('hash_placeholder');
            }
            this.context = GICSv2Decoder.sharedContext;
        }
    }

    async getAllSnapshots(): Promise<Snapshot[]> {
        // 1. Check Magic
        if (this.data.length < GICS_MAGIC_V2.length) {
            throw new Error('Data too short');
        }

        // Check if v2
        let isV2 = true;
        for (let i = 0; i < GICS_MAGIC_V2.length; i++) {
            if (this.data[i] !== GICS_MAGIC_V2[i]) {
                isV2 = false;
                break;
            }
        }

        if (!isV2) {
            // Backward compatibility
            return gics11_decode(this.data);
        }

        // 2. Parse V2 Header
        this.pos = GICS_MAGIC_V2.length;
        const version = this.getUint8();
        if (version !== 2) throw new Error(`Unsupported version: ${version}`);

        const flags = this.getUint32(); // Read flags (unused for now)

        // 3. Parse Blocks
        let timeData: number[] = [];
        let valueData: number[] = [];

        while (this.pos < this.data.length) {
            // Read Block Header
            if (this.pos + BLOCK_HEADER_SIZE > this.data.length) {
                break; // Should not happen if file is valid
            }

            const streamId = this.getUint8();
            const codecId = this.getUint8();
            const nItems = this.getUint32();
            const payloadLen = this.getUint32();
            const blockFlags = this.getUint8(); // [NEW] Read flags byte

            const payloadStart = this.pos;
            const payloadEnd = this.pos + payloadLen;

            if (payloadEnd > this.data.length) {
                throw new Error('Block payload exceeds file size');
            }

            const payload = this.data.subarray(payloadStart, payloadEnd);
            this.pos = payloadEnd;

            // Dispatch
            let values: number[] = [];

            if (codecId === CodecId.VARINT_DELTA || codecId === CodecId.DOD_VARINT) {
                values = decodeVarint(payload);
            } else if (codecId === CodecId.BITPACK_DELTA) {
                values = Codecs.decodeBitPack(payload, nItems);
            } else if (codecId === CodecId.RLE_ZIGZAG || codecId === CodecId.RLE_DOD) {
                values = Codecs.decodeRLE(payload);
            } else if (codecId === CodecId.DICT_VARINT) {
                values = Codecs.decodeDict(payload, this.context);
            } else {
                // Unknown codec or NONE, skip
                // Log warning?
                // console.warn('Unknown CodecId:', codecId);
                continue;
            }

            if (streamId === StreamId.TIME) {
                const isQuarantine = (blockFlags & 1 << 4) !== 0; // BLOCK_FLAGS.HEALTH_QUAR (Hardcoded here or imported? Better import if possible but simple bit check works)
                // Actually let's just pass the check.
                // We need to import BLOCK_FLAGS from format.ts, but let's assume we can add it to imports or use literal if strict.
                // Better: import { BLOCK_FLAGS } from './format.js';
                // Wait, I can't easily change imports in replace_file_content if I don't target them.
                // I will target imports separately or assume I can add it.
                // For now, let's use the explicit bit flag 0x10 (16) which is HEALTH_QUAR.

                const commitable = (blockFlags & 0x10) === 0;

                const chunkTimes = this.decodeTimeStream(values, commitable);
                for (const t of chunkTimes) timeData.push(t);
            } else if (streamId === StreamId.VALUE) {
                const commitable = (blockFlags & 0x10) === 0;
                const isDOD = (codecId === CodecId.DOD_VARINT || codecId === CodecId.RLE_DOD);
                const chunkValues = this.decodeValueStream(values, commitable, isDOD);
                for (const v of chunkValues) valueData.push(v);
            }
        }

        // 4. Reconstruct Snapshots
        const result: Snapshot[] = [];
        const count = Math.min(timeData.length, valueData.length);

        for (let i = 0; i < count; i++) {
            const map = new Map<number, { price: number; quantity: number }>();
            map.set(1, { price: valueData[i], quantity: 1 }); // Dummy ItemID 1, Qty 1

            result.push({
                timestamp: timeData[i],
                items: map
            });
        }

        return result;
    }

    private decodeTimeStream(deltas: number[], shouldCommit: boolean): number[] {
        if (deltas.length === 0) return [];
        const timestamps: number[] = [];

        let prev = this.context.lastTimestamp !== undefined ? this.context.lastTimestamp : 0;
        let prevDelta = this.context.lastTimestampDelta !== undefined ? this.context.lastTimestampDelta : 0;

        for (let i = 0; i < deltas.length; i++) {
            const deltaOfDelta = deltas[i];
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
        if (deltas.length === 0) return [];
        const values: number[] = [];
        let prev = this.context.lastValue !== undefined ? this.context.lastValue : 0;
        let prevDelta = this.context.lastValueDelta !== undefined ? this.context.lastValueDelta : 0;

        for (let i = 0; i < deltas.length; i++) {
            let change = deltas[i];

            if (isDOD) {
                // Input is DeltaOfDelta
                const currentDelta = prevDelta + change;
                change = currentDelta; // Change to Apply is the new Delta
                prevDelta = currentDelta;
            } else {
                // Input is Delta (update prevDelta for consistency if we switch modes? 
                // Contextv0 explicitly separates lastValueDelta.
                // If we are in Delta mode, lastValueDelta becomes the delta we just applied?
                // Or undefined?
                // For safety, let's track the delta we applied.
                const currentDelta = change;
                prevDelta = currentDelta;
            }

            const current = prev + change;
            values.push(current);
            prev = current;
        }

        if (shouldCommit) {
            this.context.lastValue = prev;
            // Only update delta if we tracked it
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
}
