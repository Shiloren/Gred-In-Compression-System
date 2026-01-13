import { GICSv2Encoder, GICSv2Decoder } from '../../../src/index.js';

async function main() {
    console.log("Debugging GICS v1.2 Roundtrip...");

    // Manual small dataset
    const data = [
        { t: 1000, v: 10 },
        { t: 1010, v: 11 },
        { t: 1025, v: 12 },
        { t: 1050, v: 13 },
        { t: 1100, v: 14 }
    ];

    GICSv2Encoder.resetSharedContext();
    const encoder = new GICSv2Encoder();

    for (const row of data) {
        const m = new Map();
        m.set(1, { price: row.v, quantity: 1 });
        await encoder.addSnapshot({ timestamp: row.t, items: m });
    }

    const encoded = await encoder.finish();
    console.log(`Encoded ${data.length} items into ${encoded.length} bytes.`);

    GICSv2Decoder.resetSharedContext();
    const decoder = new GICSv2Decoder(encoded);
    const decoded = await decoder.getAllSnapshots();

    console.log(`Decoded ${decoded.length} items.`);

    for (let i = 0; i < data.length; i++) {
        const inp = data[i];
        const out = decoded[i];
        console.log(`[${i}] In: T=${inp.t} V=${inp.v} | Out: T=${out?.timestamp} V=${out?.items.get(1)?.price}`);

        if (out.timestamp !== inp.t) console.error("MISMATCH T!");
        if (out.items.get(1)?.price !== inp.v) console.error("MISMATCH V!");
    }
}

main().catch(console.error);
