import { GICSv2Encoder, GICSv2Decoder, IntegrityError, IncompleteDataError, GicsError } from '../../../src/index.js';
import { CriticalRNG } from './common/rng.js';

// --- ARGS ---
const SEED = parseInt(process.env.SEED || '12345');
const SIZE = parseInt(process.env.SIZE || '1000');
const FUZZ_MODE = process.env.FUZZ_MODE || 'RANDOM';
const FUZZ_SEED = parseInt(process.env.FUZZ_SEED || '999');

async function main() {
    try {
        const rng = new CriticalRNG(SEED);
        const fuzzRng = new CriticalRNG(FUZZ_SEED);

        // 1. Generate & Encode (Valid Base)
        const encoder = new GICSv2Encoder();
        for (let i = 0; i < SIZE; i++) {
            const t = 1000 + i * 100;
            const v = 1000 + i;
            const map = new Map();
            map.set(1, { price: v, quantity: 1 });
            await encoder.addSnapshot({ timestamp: t, items: map });
        }
        let encoded = await encoder.finish();

        // 2. Fuzz (Mutate)
        const mutated = new Uint8Array(encoded); // Copy
        const len = mutated.length;

        // console.log(`[FUZZ] Starting: Mode=${FUZZ_MODE} Len=${len}`);

        if (FUZZ_MODE === 'RANDOM') {
            // Randomly flip or corrupt bytes
            const mutationCount = fuzzRng.nextInt(1, Math.max(2, Math.floor(len / 10))); // Up to 10% mutations
            for (let i = 0; i < mutationCount; i++) {
                const idx = fuzzRng.nextInt(0, len);
                const val = fuzzRng.nextInt(0, 256);
                mutated[idx] = val;
            }
        }
        else if (FUZZ_MODE === 'STRUCTURAL') {
            const count = fuzzRng.nextInt(1, 5);
            for (let i = 0; i < count; i++) {
                const idx = fuzzRng.nextInt(9, len); // Skip File Header
                mutated[idx] = 0xFF; // Force continuation or Max Value
            }
        }

        // 3. Decode
        GICSv2Decoder.resetSharedContext();

        try {
            const decoder = new GICSv2Decoder(mutated);
            const result = await decoder.getAllSnapshots();
            console.log(`[FUZZ] Survived! Decoded ${result.length} items (Warning: Silent Acceptance of Garbage?)`);

        } catch (innerErr: any) {
            // Re-throw to be caught by main handler which classifies it
            throw innerErr;
        }

    } catch (e: any) {
        const msg = e.message || '';
        const name = e.name || '';

        // Allowed Errors (Safe Failures)
        const isSafe =
            msg.includes('Truncated') ||
            msg.includes('Incomplete') ||
            msg.includes('RangeError') ||
            name === 'RangeError' ||
            msg.includes('Block payload exceeds') ||
            msg.includes('too short') ||
            msg.includes('bounds') ||
            msg.includes('Unsupported version') ||
            msg.includes('Missing EOS') ||
            msg.includes('CRC') ||
            msg.includes('Integrity') ||
            msg.includes('Data too short') ||
            msg.includes('Invalid') ||
            msg.includes('malformed') ||
            msg.includes('limit exceeded') ||      // Security Limits
            msg.includes('too large') ||           // Security Limits
            (e instanceof IntegrityError) ||
            (e instanceof IncompleteDataError) ||
            (e instanceof GicsError);

        if (isSafe) {
            // console.error(`[CAUGHT] Safe Error: ${msg}`); 
            process.exit(101); // 101 or 102 treated as PASS
        }

        // Unsafe Crash
        console.error(`[CRASH] Unsafe Error: ${msg}`);
        console.error(e);
        process.exit(1);
    }
}

main();
