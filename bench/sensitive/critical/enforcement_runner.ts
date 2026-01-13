import { GICSv2Encoder, GICSv2Decoder } from '../../../src/index.js';
import { IncompleteDataError } from './common/error-types.js';

// Manually construct a "Legacy v1.2" file (Valid v1.2 headers/blocks, but NO EOS)
// We can use the Encoder, but strip the last 11 bytes (EOS Block)
// Or use specific knowledge of EOS block size.

async function main() {
    console.log("=== EOS ENFORCEMENT TEST ===");

    // 1. Create Valid File
    const encoder = new GICSv2Encoder();
    await encoder.addSnapshot({ timestamp: 1000, items: new Map() });
    const fullBuffer = await encoder.finish();

    // 2. Strip EOS (Last 11 bytes: 1+1+4+4+1)
    // EOS Header is 11 bytes. Payload 0.
    const eosLen = 11;
    const legacyBuffer = fullBuffer.slice(0, fullBuffer.length - eosLen);

    console.log(`Full Size: ${fullBuffer.length}`);
    console.log(`Legacy Size: ${legacyBuffer.length}`);

    // 3. Attempt Decode
    try {
        const decoder = new GICSv2Decoder(legacyBuffer);
        await decoder.getAllSnapshots();
        console.error("FAIL: Decoder accepted file without EOS!");
        process.exit(1);
    } catch (e: any) {
        if (e.message.includes("Missing EOS")) {
            console.log("PASS: Caught Missing EOS error.");
            process.exit(0);
        } else {
            console.error(`FAIL: Caught unexpected error: ${e.message}`);
            process.exit(1);
        }
    }
}

main();
