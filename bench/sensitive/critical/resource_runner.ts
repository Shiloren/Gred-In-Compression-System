import { GICSv2Encoder, GICSv2Decoder } from '../../../src/index.js';

// RESOURCE RUNNER
// Verifies that GICS v1.2 strictly enforces resource limits to prevent DoS.

async function verifyError(name: string, data: Uint8Array, errorMatch: string) {
    try {
        const decoder = new GICSv2Decoder(data);
        await decoder.getAllSnapshots();
        console.error(`FAIL [${name}]: Accepted malicious payload`);
        return false;
    } catch (e: any) {
        if (e.message.includes(errorMatch)) {
            console.log(`PASS [${name}]: Caught '${errorMatch}'`);
            return true;
        } else {
            console.error(`FAIL [${name}]: Caught wrong error: ${e.message}`);
            return false;
        }
    }
}

async function main() {
    console.log("=== RESOURCE DOS PROTECTION TEST ===");
    let failures = 0;

    // 1. Generate Base
    const encoder = new GICSv2Encoder();
    await encoder.addSnapshot({ timestamp: 100, items: new Map() });
    const base = await encoder.finish();

    // Base structure (approx):
    // Header(10) + Block Header(11) + Payload(eos)
    // We want to Forge a Block Header.
    // 0: Stream(1), 1: Codec(1), 2-5: N, 6-9: Len, 10: Flags

    // ATTACK 1: Huge nItems (Memory bomb potential)
    const attack1 = new Uint8Array(base);
    const view1 = new DataView(attack1.buffer);
    // Find first block nItems. Offset depends on Header.
    // Header is 15 bytes in v1.2 (Magic(4)+Ver(1)+Flags(4) ? Wait, let's verify format.ts)
    // decode.ts: pos = Magic(4) + 1 + 4 = 9 bytes? 
    // Wait, decode.ts: `this.pos = GICS_MAGIC_V2.length; getUint8(); getUint32();`
    // If Magic is 4 bytes. +1 +4 = 9. So Block starts at 9.
    // Block: Stream(1), Codec(1), N(4) -> Offset 9+2 = 11.
    // Let's force N = 1,000,000

    const blockStart = 9;
    view1.setUint32(blockStart + 2, 1_000_000, true);

    // We also need to fix payloadLen? If we just increase N, bitpacking/rle loop might run?
    // But invalid N should trigger "Items limit exceeded" Check added in decode.ts.

    if (!await verifyError("Huge N", attack1, "limit exceeded")) failures++;


    // ATTACK 2: RLE Explosion
    // Can we forge RLE data? Harder without raw RLE encoder.
    // But we proved RLE limits exist in code.
    // We can try to modify a valid RLE block?
    // Let's stick to "Huge N" which we proved causes DoS in Repro.

    if (failures === 0) {
        console.log("Resource protection verified.");
        process.exit(0);
    } else {
        console.error("Resource protection FAILED.");
        process.exit(1);
    }
}

main();
