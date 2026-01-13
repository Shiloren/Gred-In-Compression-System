import { decodeVarint } from '../../gics-utils.js';
import { GICS_MAGIC_V2, StreamId, CodecId, BLOCK_HEADER_SIZE } from './format.js';
// Dilemma: gics11_decode logic.
// If v2Decoder falls back to v1.1, it delegates.
// If v2Decoder signature is `getAllFrames(): GicsFrame[]`, then v1.1 output must be converted.
// But we cannot import adapter in Core.
// Resolution: gics-core v1.2 should ONLY handle v1.2?
// L52: return gics11_decode(this.data);
// gics11_decode returns `Snapshot[]`.
// Use `any` cast or refactor later?
// Prompt says: "Core stays clean".
// I will change return type to `Promise<GicsFrame[] | any[]>` or just `Promise<GicsFrame[]>`.
// And I will COMMENT OUT the v1.1 fallback or make it throw "Legacy version not supported in Agnostic Engine"?
// "Keep backward compatibility via adapters".
// Adapters are external.
// So `GICSv2Decoder` should strictly handle v2.
// The fallback to v1.1 L52 was convenience.
// I will REMOVE v1.1 fallback from Agnostic Decoder. It creates dependency on frozen legacy code.
// The Wrapper can handle version sniffing?
// Yes.
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
    async getAllFrames() {
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
            // Agnostic Engine: Strictly v2+. Legacy formats should be handled by legacy wrappers.
            throw new Error("GICSv2Decoder: Only v2 format supported in agnostic engine.");
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
                continue;
            }
            if (streamId === StreamId.TIME) {
                const commitable = (blockFlags & 0x10) === 0;
                const chunkTimes = this.decodeTimeStream(values, commitable);
                for (const t of chunkTimes)
                    timeData.push(t);
            }
            else if (streamId === StreamId.VALUE) {
                const commitable = (blockFlags & 0x10) === 0;
                const isDOD = (codecId === CodecId.DOD_VARINT || codecId === CodecId.RLE_DOD);
                const chunkValues = this.decodeValueStream(values, commitable, isDOD);
                for (const v of chunkValues)
                    valueData.push(v);
            }
        }
        // 4. Reconstruct Canonical Frames
        const result = [];
        const count = Math.min(timeData.length, valueData.length);
        for (let i = 0; i < count; i++) {
            // Agnostic Reconstruction
            // We produce a frame with 'val' stream (implicit v1.2 contract).
            // EntityID is not in the file?
            // "GICS Format.. includes context_id?"
            // Header has contextId?
            // For now, EntityId is unknown. Adapter can fill it. Used "1" in legacy.
            // Core will use "ENTITY_UNKNOWN" or "DEFAULT".
            // Since Core v1.2 is Single Context, we can assume one entity per stream?
            // Let's use "0" or "unknown".
            result.push({
                entityId: "0",
                timestamp: timeData[i],
                streams: {
                    'val': valueData[i]
                }
            });
        }
        return result;
    }
    decodeTimeStream(deltas, shouldCommit) {
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
        if (shouldCommit) {
            this.context.lastTimestamp = prev;
            this.context.lastTimestampDelta = prevDelta;
        }
        return timestamps;
    }
    decodeValueStream(deltas, shouldCommit, isDOD = false) {
        if (deltas.length === 0)
            return [];
        const values = [];
        let prev = this.context.lastValue !== undefined ? this.context.lastValue : 0;
        let prevDelta = this.context.lastValueDelta !== undefined ? this.context.lastValueDelta : 0;
        for (let i = 0; i < deltas.length; i++) {
            let change = deltas[i];
            if (isDOD) {
                // Input is DeltaOfDelta
                const currentDelta = prevDelta + change;
                change = currentDelta; // Change to Apply is the new Delta
                prevDelta = currentDelta;
            }
            else {
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
    getUint8() {
        return this.data[this.pos++];
    }
    getUint32() {
        const val = new DataView(this.data.buffer, this.data.byteOffset + this.pos, 4).getUint32(0, true);
        this.pos += 4;
        return val;
    }
}
