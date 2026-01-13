import { GICSv2Encoder, GICSv2Decoder, IntegrityError, GicsError, IncompleteDataError } from '../../../src/index.js';
import { CriticalRNG } from './common/rng.js';
import { CRITICAL_LIMITS } from './common/limits.js';

// --- ARGS ---
const SEED = parseInt(process.env.SEED || '0');
const SIZE = parseInt(process.env.SIZE || '1000');
const TYPE = process.env.TYPE || 'NORMAL'; // NORMAL, MIXED, GIANT
const MUTATION_MODE = process.env.MUTATION_MODE || 'NONE'; // NONE, HEADER, PAYLOAD, TRUNCATE
const MUTATION_SEED = parseInt(process.env.MUTATION_SEED || '0');

console.log("[WORKER] Starting Integrity Check: Type=" + TYPE + " Size=" + SIZE + " Seed=" + SEED + " Mutation=" + MUTATION_MODE);

// --- GENERATOR ---
function generateData(rng: CriticalRNG, size: number, type: string) {
    const data: { t: number, v: number }[] = [];
    let t = 1000;
    let v = 1000;

    for (let i = 0; i < size; i++) {
        t += rng.nextInt(1, 100);

        if (type === 'MIXED') {
            if (i % 100 < 50) v += rng.nextInt(-5, 5); // Smooth
            else v = rng.nextInt(0, 1000000); // Chaos
        } else {
            v += rng.nextInt(-10, 10); // Normal Trend
        }
        data.push({ t, v });
    }
    return data;
}

// --- MAIN ---
async function main() {
    try {
        const rng = new CriticalRNG(SEED);
        const dataset = generateData(rng, SIZE, TYPE);

        // 1. ENCODE
        const encoder = new GICSv2Encoder();
        for (const row of dataset) {
            const map = new Map();
            map.set(1, { price: row.v, quantity: 1 });
            await encoder.addSnapshot({ timestamp: row.t, items: map });
        }
        let encoded = await encoder.finish();

        // 2. MUTATION (The Attack)
        if (MUTATION_MODE !== 'NONE') {
            const attackRng = new CriticalRNG(MUTATION_SEED);

            // Defensively copy to avoid mutating source if retained
            const mutated = new Uint8Array(encoded);

            if (MUTATION_MODE === 'HEADER') {
                //Corrupt first 10 bytes
                const idx = attackRng.nextInt(0, 10);
                mutated[idx] ^= 0xFF;
                console.log("[ATTACK] Corrupted Header Byte at " + idx);
            }
            else if (MUTATION_MODE === 'PAYLOAD') {
                // Corrupt somewhere in the middle
                const idx = attackRng.nextInt(10, mutated.length);
                mutated[idx] ^= 0xFF;
                console.log("[ATTACK] Corrupted Payload Byte at " + idx);
            }
            else if (MUTATION_MODE === 'TRUNCATE') {
                const cut = attackRng.nextInt(1, mutated.length - 1);
                encoded = mutated.slice(0, cut); // Update the buffer ref
                console.log("[ATTACK] Truncated at " + cut + "/" + mutated.length);
            }

            if (MUTATION_MODE !== 'TRUNCATE') encoded = mutated;
        }

        // 3. DECODE
        GICSv2Decoder.resetSharedContext();
        const decoder = new GICSv2Decoder(encoded);
        const result = await decoder.getAllSnapshots();

        // 4. VERIFY (If we expect success)
        if (MUTATION_MODE !== 'NONE') {
            // Expect error
        }

        if (result.length !== dataset.length) {
            throw new IntegrityError("Count mismatch: Input=" + dataset.length + ", Output=" + result.length);
        }

        for (let i = 0; i < dataset.length; i++) {
            const orig = dataset[i];
            const rec = result[i];

            if (rec.timestamp !== orig.t) throw new IntegrityError("Timestamp mismatch at " + i);
            const val = rec.items.get(1)?.price;
            if (val !== orig.v) throw new IntegrityError("Value mismatch at " + i + ": Expected " + orig.v + ", Got " + val);
        }

        console.log("[SUCCESS] Bit-Exact Roundtrip Verified");

    } catch (e: any) {
        // Classify Error for the Runner
        const isIntegrity = (e instanceof IntegrityError) || e.name === 'IntegrityError'
            || e.message.includes('CRC')
            || (e instanceof GicsError)
            || e.message.includes('Checksum') || e.message.includes('Integrity');

        const isIncomplete = (e instanceof IncompleteDataError) || e.name === 'IncompleteDataError'
            || e.message.includes('Truncated') || e.message.includes('Incomplete') || e.message.includes('RangeError') || e.message.includes('Block payload exceeds') || e.message.includes('Missing EOS');

        if (isIntegrity) {
            console.error("[CAUGHT] IntegrityError: " + e.message);
            process.exit(101);
        }
        if (isIncomplete) {
            console.error("[CAUGHT] IncompleteError: " + e.message);
            process.exit(102);
        }

        // Generic failure
        console.error(e);
        process.exit(1);
    }
}

main();
