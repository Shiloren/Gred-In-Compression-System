import { decodeVarint } from '../../gics-utils.js';
import { GICS_MAGIC_V2, StreamId, CodecId, BLOCK_HEADER_SIZE } from './format.js';
import { gics11_decode } from '../../../gics_frozen/v1_1_0/index.js';
import { ContextV0 } from './context.js';
import { Codecs } from './codecs.js';
export class GICSv2Decoder {
    data;
    pos = 0;
    context;
    static sharedContext = null;
    static resetSharedContext() {
        GICSv2Decoder.sharedContext = null;
    }
    constructor(data) {
        this.data = data;
        const mode = process.env.GICS_CONTEXT_MODE || 'on';
        if (mode === 'off') {
            this.context = new ContextV0('hash_placeholder');
        }
        else {
            if (!GICSv2Decoder.sharedContext) {
                GICSv2Decoder.sharedContext = new ContextV0('hash_placeholder');
            }
            this.context = GICSv2Decoder.sharedContext;
        }
    }
    async getAllSnapshots() {
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
        if (version !== 2)
            throw new Error(`Unsupported version: ${version}`);
        const flags = this.getUint32(); // Read flags (unused for now)
        // 3. Parse Blocks
        let timeData = [];
        let valueData = [];
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
            let values = [];
            if (codecId === CodecId.VARINT_DELTA || codecId === CodecId.DOD_VARINT) {
                values = decodeVarint(payload);
            }
            else if (codecId === CodecId.BITPACK_DELTA) {
                values = Codecs.decodeBitPack(payload, nItems);
            }
            else if (codecId === CodecId.RLE_ZIGZAG || codecId === CodecId.RLE_DOD) {
                values = Codecs.decodeRLE(payload);
            }
            else if (codecId === CodecId.DICT_VARINT) {
                values = Codecs.decodeDict(payload, this.context);
            }
            else {
                // Unknown codec or NONE, skip
                // Log warning?
                // console.warn('Unknown CodecId:', codecId);
                continue;
            }
            if (streamId === StreamId.TIME) {
                const chunkTimes = this.decodeTimeStream(values);
                for (const t of chunkTimes)
                    timeData.push(t);
            }
            else if (streamId === StreamId.VALUE) {
                const chunkValues = this.decodeValueStream(values);
                for (const v of chunkValues)
                    valueData.push(v);
            }
        }
        // 4. Reconstruct Snapshots
        const result = [];
        const count = Math.min(timeData.length, valueData.length);
        for (let i = 0; i < count; i++) {
            const map = new Map();
            map.set(1, { price: valueData[i], quantity: 1 }); // Dummy ItemID 1, Qty 1
            result.push({
                timestamp: timeData[i],
                items: map
            });
        }
        return result;
    }
    decodeTimeStream(deltas) {
        if (deltas.length === 0)
            return [];
        const timestamps = [];
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
        this.context.lastTimestamp = prev;
        this.context.lastTimestampDelta = prevDelta;
        return timestamps;
    }
    decodeValueStream(deltas) {
        if (deltas.length === 0)
            return [];
        const values = [];
        let prev = this.context.lastValue !== undefined ? this.context.lastValue : 0;
        for (let i = 0; i < deltas.length; i++) {
            const diff = deltas[i];
            const current = prev + diff;
            values.push(current);
            prev = current;
        }
        this.context.lastValue = prev;
        return values;
    }
    getUint8() {
        return this.data[this.pos++];
    }
    getUint32() {
        const val = new DataView(this.data.buffer, this.data.byteOffset + this.pos, 4).getUint32(0, true);
        this.pos += 4;
        return val;
    }
}
