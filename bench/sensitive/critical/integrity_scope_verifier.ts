import { GICSv2Encoder, GICSv2Decoder } from '../../../src/index.js';

// SCOPE VERIFIER
// Proves that GICS v1.2 does NOT have internal integrity checksums.
// We will flip a bit in a value payload and assert that it decodes SILENTLY to a wrong value.
// This confirms the "Integrity Guarantee" is actually "None" (Structural Validity Only).

async function main() {
    console.log("=== INTEGRITY SCOPE VERIFIER ===");

    // 1. Create Valid File
    // Use CodecId.BITPACK_DELTA or VARINT_DELTA.
    // Let's use simple VARINT for Predictability.
    // 1000 items. Codec selection logic chooses Varint if not compressible?
    // We force a specific codec? No, we use engine defaults.
    // High entropy values -> Varint.

    const encoder = new GICSv2Encoder();
    const map = new Map();
    map.set(1, { price: 100, quantity: 1 }); // Value 100
    await encoder.addSnapshot({ timestamp: 1000, items: map });
    const fullBuffer = await encoder.finish();

    console.log(`Original Size: ${fullBuffer.length}`);

    // Inspect Buffer:
    // Header(10ish) + Block.
    // Block: Stream(1) + Codec(1) + N(4) + Len(4) + Flags(1)
    // Payloads follow.
    // Varint(100) = 0x64 (Single Byte).
    // Or ZigZag(100) = 200 = 0xC8 0x01.
    // We look for a byte to flip.
    // We can just flip EVERY byte one by one until we find one that decodes successfully but with different value.

    let silentCorruptionFound = false;

    for (let i = fullBuffer.length - 12; i > 15; i--) { // Skip EOS (last 11), Skip Header (first 15ish)
        const mutated = new Uint8Array(fullBuffer);
        mutated[i] ^= 0x04; // Flip 3rd bit

        try {
            GICSv2Decoder.resetSharedContext();
            const decoder = new GICSv2Decoder(mutated);
            const snapshots = await decoder.getAllSnapshots();

            // If we are here, it decoded. Check value.
            const val = snapshots[0].items.get(1)?.price;
            if (val !== 100) {
                console.log(`[PROOF] Silent Corruption at offset ${i}. Orig=100, New=${val}`);
                silentCorruptionFound = true;
                break;
            }
        } catch (e) {
            // Caught error (Structural), continue searching
        }
    }

    if (silentCorruptionFound) {
        console.log("PASS: Verified that GICS v1.2 has NO integrity checksum.");
        process.exit(0);
    } else {
        console.error("FAIL: Could not induce silent corruption. Integrity might exist?");
        process.exit(1);
    }
}

main();
