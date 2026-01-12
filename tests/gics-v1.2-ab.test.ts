
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { GICSv2Encoder } from '../src/gics/v1_2/encode.js';
import { GICSv2Decoder } from '../src/gics/v1_2/decode.js';

describe('GICS v1.2 A/B Context Mode', () => {

    // Dataset: 2 chunks
    // Chunk 1: T=[100, 200], V=[10, 20]
    // Chunk 2: T=[300, 400], V=[30, 40]
    // If context ON: Chunk 2 T starts delta from 200.
    // If context OFF: Chunk 2 T starts delta from 0 (or absolute).

    const chunk1Data: any[] = [
        { t: 100, v: 10 },
        { t: 200, v: 20 }
    ];
    const chunk2Data: any[] = [
        { t: 300, v: 30 },
        { t: 400, v: 40 }
    ];

    async function encodeChunk(data: any[]) {
        const enc = new GICSv2Encoder();
        for (const item of data) {
            const map = new Map();
            map.set(1, { price: item.v, quantity: 1 });
            await enc.addSnapshot({ timestamp: item.t, items: map });
        }
        const result = await enc.flush();
        await enc.finalize();
        return result;
    }

    async function decodeChunk(bytes: Uint8Array) {
        const dec = new GICSv2Decoder(bytes);
        const snaps = await dec.getAllSnapshots();
        return snaps.map(s => {
            const val = s.items.get(1)?.price || 0;
            return { t: s.timestamp, v: val };
        });
    }

    it('CTX_OFF should roundtrip correctly (independence)', async () => {
        process.env.GICS_CONTEXT_MODE = 'off';

        // Encode C1
        const c1Bytes = await encodeChunk(chunk1Data);
        // Encode C2 (fresh instance, no context)
        const c2Bytes = await encodeChunk(chunk2Data);

        // Decode
        const dec1 = await decodeChunk(c1Bytes);
        const dec2 = await decodeChunk(c2Bytes);

        assert.deepStrictEqual(dec1, chunk1Data, 'Chunk 1 OFF decode mismatch');
        assert.deepStrictEqual(dec2, chunk2Data, 'Chunk 2 OFF decode mismatch');
    });

    it('CTX_ON should roundtrip correctly (persistence)', async () => {
        process.env.GICS_CONTEXT_MODE = 'on';
        GICSv2Encoder.resetSharedContext();
        GICSv2Decoder.resetSharedContext();

        // Encode C1 -> Update shared encode context
        const c1Bytes = await encodeChunk(chunk1Data);
        // Encode C2 -> Should use shared encode context
        const c2Bytes = await encodeChunk(chunk2Data);

        // Decode C1 -> Update shared decode context
        const dec1 = await decodeChunk(c1Bytes);
        // Decode C2 -> Should use shared decode context
        const dec2 = await decodeChunk(c2Bytes);

        assert.deepStrictEqual(dec1, chunk1Data, 'Chunk 1 ON decode mismatch');
        assert.deepStrictEqual(dec2, chunk2Data, 'Chunk 2 ON decode mismatch');
    });

    it('CTX_ON should produce smaller/different output for Chunk 2', async () => {
        // Run OFF again to capture bytes
        process.env.GICS_CONTEXT_MODE = 'off';
        const offBytes2 = await encodeChunk(chunk2Data);

        // Run ON again
        process.env.GICS_CONTEXT_MODE = 'on';
        GICSv2Encoder.resetSharedContext();
        // C1
        await encodeChunk(chunk1Data);
        // C2
        const onBytes2 = await encodeChunk(chunk2Data);

        // Check difference
        // Chunk 2 OFF: [300, 400]. 
        // Chunk 2 ON: [300, 400] but relative to 200. 
        // Delta OFF: t[0]=300.
        // Delta ON: t[0]=300-200 = 100.
        // Varint(300) is 2 bytes (0xAC 0x02). Varint(100) is 1 byte (0x64).
        // So ON bytes should be smaller or different.

        // assert.notDeepStrictEqual(offBytes2, onBytes2, 'CTX_ON bytes should differ from CTX_OFF');
        // Actually, for small numbers Varint might be same size, but values different.
        // 300 vs 100 is definitely different bytes.

        assert.notEqual(offBytes2.length, 0);
        assert.notEqual(onBytes2.length, 0);

        // We just verify they are not byte-identical to prove context effect.
        // Note: header flags are consistent.
        // Only stream content differs.
        let same = true;
        if (offBytes2.length === onBytes2.length) {
            for (let i = 0; i < offBytes2.length; i++) {
                if (offBytes2[i] !== onBytes2[i]) {
                    same = false;
                    break;
                }
            }
        } else {
            same = false;
        }

        assert.strictEqual(same, false, 'CTX_ON output should differ from CTX_OFF output due to context usage');
    });
});
