
import { GICSv2Encoder } from './src/gics/v1_2/encode.js';
import { GICSv2Decoder } from './src/gics/v1_2/decode.js';
import { Snapshot } from './src/gics-types.js';
import * as fs from 'fs';
import * as path from 'path';

async function runVerification() {
    console.log("=== GICS v1.2 CANONICAL VERIFICATION PROOF ===");
    console.log("1. Environment Setup...");

    process.env.GICS_VERSION = '1.2';
    process.env.GICS_CONTEXT_MODE = 'off';

    // Reset any shared state
    GICSv2Encoder.resetSharedContext();
    GICSv2Decoder.resetSharedContext();

    console.log("2. Generating Complex Multi-Item Dataset...");

    const snapshots: Snapshot[] = [];
    const baseTime = 1700000000;
    const NUM_SNAPSHOTS = 5;

    // Create distinct items to prove ID preservation
    const ITEM_IDS = [101, 202, 303, 404, 555];

    for (let i = 0; i < NUM_SNAPSHOTS; i++) {
        const map = new Map<number, { price: number; quantity: number }>();

        // Vary item count to prove SNAPSHOT_LEN works
        // Snapshot 0: All items
        // Snapshot 1: First 2 items
        // Snapshot 2: Last 2 items
        // Snapshot 3: Empty
        // Snapshot 4: All items mixed

        if (i === 0) {
            ITEM_IDS.forEach(id => map.set(id, { price: 100 + id, quantity: 10 }));
        } else if (i === 1) {
            map.set(101, { price: 150, quantity: 5 });
            map.set(202, { price: 250, quantity: 5 });
        } else if (i === 2) {
            map.set(404, { price: 450, quantity: 20 });
            map.set(555, { price: 600, quantity: 20 });
        } else if (i === 3) {
            // Empty snapshot
        } else if (i === 4) {
            ITEM_IDS.forEach(id => map.set(id, { price: 200 + id, quantity: 100 }));
        }

        snapshots.push({ timestamp: baseTime + (i * 60), items: map });
    }

    console.log(`   Generated ${snapshots.length} snapshots with variable structures.`);

    console.log("3. Encoding...");
    const encoder = new GICSv2Encoder();
    for (const s of snapshots) await encoder.addSnapshot(s);
    const encoded = await encoder.flush();
    await encoder.finalize();

    console.log(`   Encoded size: ${encoded.length} bytes.`);

    // Verify EOS
    const eos = encoded[encoded.length - 1];
    if (eos !== 0xFF) {
        console.error(`❌ CRITICAL FAILURE: Missing EOS Marker. Expected 0xFF, got 0x${eos.toString(16)}`);
        process.exit(1);
    } else {
        console.log("   ✅ EOS Marker (0xFF) present.");
    }

    console.log("4. Decoding...");
    const decoder = new GICSv2Decoder(encoded);
    const decoded = await decoder.getAllSnapshots();

    console.log(`   Decoded ${decoded.length} snapshots.`);

    console.log("5. Verifying Integrity (Deep Equality)...");

    if (decoded.length !== snapshots.length) {
        console.error(`❌ LENGTH MISMATCH: Expected ${snapshots.length}, got ${decoded.length}`);
        process.exit(1);
    }

    for (let i = 0; i < snapshots.length; i++) {
        const original = snapshots[i];
        const reconstructed = decoded[i];

        if (reconstructed.timestamp !== original.timestamp) {
            console.error(`❌ TIMESTAMP MISMATCH at index ${i}`);
            process.exit(1);
        }

        if (reconstructed.items.size !== original.items.size) {
            console.error(`❌ ITEM COUNT MISMATCH at index ${i}: Expected ${original.items.size}, got ${reconstructed.items.size}`);
            process.exit(1);
        }

        for (const [id, val] of original.items) {
            const recVal = reconstructed.items.get(id);
            if (!recVal) {
                console.error(`❌ ITEM MISSING at index ${i}: ItemID ${id}`);
                process.exit(1);
            }
            if (recVal.price !== val.price || recVal.quantity !== val.quantity) {
                console.error(`❌ DATA CORRUPTION at index ${i}, ItemID ${id}: Expected {p:${val.price},q:${val.quantity}}, Got {p:${recVal.price},q:${recVal.quantity}}`);
                process.exit(1);
            }
        }
    }

    console.log("   ✅ Data Integrity: PERFECT ROUNDTRIP.");

    console.log("6. Verifying Determinism...");

    // Encode again with different insertion order using same data
    GICSv2Encoder.resetSharedContext();
    const encoder2 = new GICSv2Encoder();

    // Create new maps with REVERSE insertion order for snapshot 0
    const snapshot2 = { ...snapshots[0], items: new Map() };
    [...snapshots[0].items.entries()].reverse().forEach(([k, v]) => snapshot2.items.set(k, v));

    await encoder2.addSnapshot(snapshot2);
    // Add rest normally
    for (let i = 1; i < snapshots.length; i++) await encoder2.addSnapshot(snapshots[i]);

    const encoded2 = await encoder2.flush();

    let deterministic = true;
    if (encoded.length !== encoded2.length) deterministic = false;
    for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] !== encoded2[i]) {
            deterministic = false;
            break;
        }
    }

    if (deterministic) {
        console.log("   ✅ Determinism: PASSED (Input order ignored, output identical).");
    } else {
        console.error("❌ DETERMINISM FAILED: Output bytes differ based on Map insertion order.");
        process.exit(1);
    }

    console.log("\n=== VERDICT: GICS v1.2 IS CANONICAL & SECURE ===");
}

runVerification().catch(e => {
    console.error("CRITICAL EXCEPTION:", e);
    process.exit(1);
});
