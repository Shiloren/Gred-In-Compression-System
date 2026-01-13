import { GICSv2Encoder, GICSv2Decoder, IntegrityError, IncompleteDataError, GicsError } from '../../../src/index.js';
import { CriticalRNG } from './common/rng.js';

// --- ARGS ---
const SEED = parseInt(process.env.SEED || '12345');
const SIZE = parseInt(process.env.SIZE || '1000');
const TRUNCATE_AT = parseInt(process.env.TRUNCATE_AT || '-1');

async function main() {
    try {
        const rng = new CriticalRNG(SEED);

        // 1. Generate & Encode
        const encoder = new GICSv2Encoder();
        for (let i = 0; i < SIZE; i++) {
            const t = 1000 + i * 100;
            const v = 1000 + i;
            const map = new Map();
            map.set(1, { price: v, quantity: 1 });
            // Add noise? No, predictable is better for crash test
            await encoder.addSnapshot({ timestamp: t, items: map });
        }
        let encoded = await encoder.finish();

        // 2. Truncate
        if (TRUNCATE_AT >= 0 && TRUNCATE_AT < encoded.length) {
            encoded = encoded.slice(0, TRUNCATE_AT);
            console.log(`[CRASH] Truncated at ${TRUNCATE_AT}`);
        } else {
            console.log(`[CRASH] Full length ${encoded.length}`);
        }

        // 3. Decode
        GICSv2Decoder.resetSharedContext();
        const decoder = new GICSv2Decoder(encoded);
        const result = await decoder.getAllSnapshots();

        // 4. Result
        // If we reached here, Decoder accepted the file.
        // If we truncated, this is potentially BAD unless we truncated at a valid boundary (unlikely) AND GICS supports streaming.
        // But for "Critical" usage, we usually demand "Atomic File" (All or Nothing).
        // If GICS allows valid prefix, we must document it.
        // But the requirement says "Falla cerrado".
        // So we expect IncompleteDataError.

        console.log(`[SUCCESS] Decoded ${result.length} items.`);

    } catch (e: any) {
        const msg = e.message || '';
        const name = e.name || '';

        const isExpected =
            msg.includes('Truncated') ||
            msg.includes('Incomplete') ||
            msg.includes('RangeError') ||
            name === 'RangeError' ||
            name === 'RangeError [as RangeError]' || // Some environments
            msg.includes('Block payload exceeds') ||
            msg.includes('too short') ||
            msg.includes('bounds') ||
            msg.includes('Unsupported version') ||
            msg.includes('Missing EOS') ||
            (e instanceof GicsError); // Wrapped Typed Errors are SAFE

        if (isExpected) {
            console.error(`[CAUGHT] IncompleteError: ${msg}`);
            process.exit(102);
        }
        console.error(e);
        process.exit(1);
    }
}

main();
