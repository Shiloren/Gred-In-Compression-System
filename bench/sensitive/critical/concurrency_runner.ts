import { GICSv2Encoder, GICSv2Decoder } from '../../../src/index.js';
import { GicsFrame } from '../../../src/gics-canonical.js';

async function generateStream(startTs: number, count: number): Promise<Uint8Array> {
    const encoder = new GICSv2Encoder();
    for (let i = 0; i < count; i++) {
        await encoder.addSnapshot({ timestamp: startTs + i, items: new Map() });
    }
    return encoder.finish();
}

async function runDecode(id: string, data: Uint8Array, expectedStart: number, count: number) {
    // Force specific timing overlap?
    // We just assume parallel promise execution interleaves enough to catch shared state.
    // If state is shared, 'lastTimestamp' will be updated by the other runner.

    // Do NOT reset context manually here, we assume user uses default constructor
    // GICSv2Decoder.resetSharedContext(); // If we do this, it resets for ALL.

    const decoder = new GICSv2Decoder(data);
    const snapshots = await decoder.getAllSnapshots();

    if (snapshots.length !== count) throw new Error(`${id}: Count mismatch. Got ${snapshots.length}`);

    for (let i = 0; i < count; i++) {
        const expected = expectedStart + i;
        const actual = snapshots[i].timestamp;
        if (actual !== expected) {
            throw new Error(`${id}: Timestamp mismatch at ${i}. Expected ${expected}, Got ${actual}. Context leaked?`);
        }
    }
    console.log(`${id}: PASS`);
}

async function main() {
    console.log("=== CONCURRENCY ISOLATION TEST ===");

    const streamA = await generateStream(0, 5000);   // 0...4999
    const streamB = await generateStream(100000, 5000); // 100000...104999

    console.log(`Stream Sizes: A=${streamA.length}, B=${streamB.length}`);

    // Reset once globally
    GICSv2Decoder.resetSharedContext();

    try {
        await Promise.all([
            runDecode('RunnerA', streamA, 0, 5000),
            runDecode('RunnerB', streamB, 100000, 5000)
        ]);
        console.log("PASS: Concurrency Isolation Verified.");
        process.exit(0);
    } catch (e: any) {
        console.error(`FAIL: ${e.message}`);
        console.error("Critical Failure: Shared State detected between parallel decoders.");
        process.exit(1);
    }
}

main();
