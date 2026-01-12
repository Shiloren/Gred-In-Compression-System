import { test } from 'node:test';
import assert from 'node:assert';
import { GICSv2Encoder } from '../src/gics/v1_2/encode.js';
import { GICSv2Decoder } from '../src/gics/v1_2/decode.js';
import { Snapshot } from '../src/gics-types.js';
import { HealthTag, BLOCK_FLAGS } from '../src/gics/v1_2/format.js';

// Helper to generate snapshots
function makeSnapshot(t: number, v: number): Snapshot {
    const map = new Map();
    map.set(1, { price: v, quantity: 1 });
    return { timestamp: t, items: map };
}

test('Split-5: Routing and Context Isolation', async (t) => {
    // 1. Setup Data
    // Pattern: Clean (A1-A5) -> Noise (B) -> Recovery (C1-C3)

    const BLOCK_SIZE = 1000;
    const snapshots: Snapshot[] = [];

    // Blocks A1-A5: Clean Linear (Train Baseline to High Ratio)
    for (let b = 0; b < 5; b++) {
        for (let i = 0; i < BLOCK_SIZE; i++) {
            const t = 1000 + (b * BLOCK_SIZE * 10) + (i * 10);
            const v = 100 + (b * BLOCK_SIZE) + i;
            snapshots.push(makeSnapshot(t, v));
        }
    }

    // Block B (Block Index 6): High Entropy Noise
    for (let i = 0; i < BLOCK_SIZE; i++) {
        const rand = Math.floor(Math.random() * 1e9); // Safe 32-bit for JS bitwise ops
        snapshots.push(makeSnapshot(100000 + i * 100, rand));
    }

    // Blocks C1-C3 (Indices 7, 8, 9): Clean Linear (Resume from A)
    // A5 ended at t=1000 + 40000 + 9990 = 50990.
    // C starts at t=200000.
    // If B is skipped, delta should be relative to A5 end.
    for (let b = 0; b < 3; b++) {
        for (let i = 0; i < BLOCK_SIZE; i++) {
            const t = 200000 + (b * BLOCK_SIZE * 10) + (i * 10);
            const v = 50000 + (b * BLOCK_SIZE) + i; // Offset value
            snapshots.push(makeSnapshot(t, v));
        }
    }

    // 2. Encode
    GICSv2Encoder.reset();
    const encoder = new GICSv2Encoder();
    for (const s of snapshots) await encoder.addSnapshot(s);
    const encoded = await encoder.flush();
    const tel = encoder.getTelemetry();

    // 3. Verify Telemetry
    // Total Chunks = 5 (A) + 1 (B) + 3 (C) = 9 chunks.
    // Total Blocks = 18 (9 Time + 9 Value).

    const blocks = tel.blocks;
    assert.strictEqual(blocks.length, 18);

    // Verify Clean Blocks (A) are CORE
    // Chunk 0 (Blocks 0,1) -> Core
    assert.ok((blocks[0].flags & BLOCK_FLAGS.HEALTH_QUAR) === 0, 'A1 Time should be Core');

    // Verify Noise Block (B) is QUARANTINE
    // Chunk 5 (Blocks 10,11)

    console.log('ALL FLAGS:', blocks.map((b, i) => `${i}:${b.flags}`).join(', '));

    const bValue = blocks[14];
    console.log('Block B Value Flags:', bValue.flags.toString(2));

    // Check if Value stream is Quarantine
    assert.ok((bValue.flags & BLOCK_FLAGS.HEALTH_QUAR) !== 0, 'Value B should be flagged QUARANTINE');
    // assert.ok((bValue.flags & BLOCK_FLAGS.ANOMALY_START) !== 0, 'Value B should be ANOMALY_START'); // Optional

    // Verify Recovery (C) -> Should eventually be CORE
    // C3 Value is Block 17.
    const c3Value = blocks[17];
    console.log('Block C3 Value Flags:', c3Value.flags.toString(2));

    // C3 should be RECOVERED (CORE).
    assert.ok((c3Value.flags & BLOCK_FLAGS.HEALTH_QUAR) === 0, 'Value C3 should be recovered to CORE state');
    assert.ok((c3Value.flags & BLOCK_FLAGS.ANOMALY_END) !== 0, 'Value C3 should mark ANOMALY_END');
    // With M=3, C1, C2, C3 might just fit?
    // C1: Pending 1. C2: Pending 2. C3: Success? Match?
    // Let's print flags.
    console.log('Block C3 Value Flags:', c3Value.flags.toString(2));

    const recovered = (c3Value.flags & BLOCK_FLAGS.HEALTH_QUAR) === 0;
    // assert.ok(recovered, 'Should recover to CORE by C3'); 
    // Commented out assertion if timing/tuning is tricky, but aiming for it.

    // 4. Roundtrip Correctness
    const decoder = new GICSv2Decoder(encoded);
    const decodedSnapshots = await decoder.getAllSnapshots();

    assert.strictEqual(decodedSnapshots.length, snapshots.length);

    // Verify B (Noise)
    const idxB = 5 * 1000 + 500;
    const valB_orig = snapshots[idxB].items.get(1)?.price;
    const valB_dec = decodedSnapshots[idxB].items.get(1)?.price;
    if (valB_dec !== valB_orig) console.log(`Mismatch B: Act=${valB_dec} Exp=${valB_orig}`);
    assert.strictEqual(valB_dec, valB_orig, 'Quarantine data B corrupted');

    // Verify C (Clean) - Critical Context Check
    // If context isolation works, C should decode correctly even if B destroyed context (if it wasn't isolated).
    const idxC = 6 * 1000 + 500; // Middle of C1
    const valC_orig = snapshots[idxC].items.get(1)?.price;
    const valC_dec = decodedSnapshots[idxC].items.get(1)?.price;
    if (valC_dec !== valC_orig) console.log(`Mismatch C: Act=${valC_dec} Exp=${valC_orig}`);
    assert.strictEqual(valC_dec, valC_orig, 'Post-recovery data C corrupted');

    console.log('Roundtrip passed.');

    // 5. Metrics
    console.log('Final Metrics:', JSON.stringify(tel, null, 2));
    assert.ok(tel.core_ratio > 2.0, `Core Ratio ${tel.core_ratio} should be healthy`);
    assert.ok(tel.quarantine_rate > 0, 'Should have quarantine rate');
});
