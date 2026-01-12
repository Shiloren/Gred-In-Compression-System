
import { GICSv2Encoder } from '../../src/gics/v1_2/encode.js';
import { generateVolatileInt, Dataset } from '../scripts/datasets.js';
import { SeededRNG } from '../scripts/rng.js';
import { createHash } from 'crypto';

function sha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

function generateTrendWithNoise(rows: number, seed: number): Dataset {
    const rng = new SeededRNG(seed);
    const data: any[] = [];
    let current = 1000;
    for (let i = 0; i < rows; i++) {
        const delta = 10;
        const noise = (i % 50 === 0) ? rng.nextInt(-5, 5) : 0;
        current += (delta + noise);
        data.push({ t: i * 1000, v: current });
    }
    const json = JSON.stringify(data);
    return { name: 'VALID_TREND_NOISE', seed, rows, data, checksum: sha256(json), size_bytes: Buffer.byteLength(json) };
}

async function runTest() {
    console.log("DEBUG: Starting ValidVolatile Test");

    const ds = generateTrendWithNoise(10000, 11111);
    console.log(`DEBUG: Generated ${ds.rows} rows`);

    process.env.GICS_VERSION = '1.2';
    process.env.GICS_CONTEXT_MODE = 'on';
    GICSv2Encoder.resetSharedContext();

    const encoder = new GICSv2Encoder();
    for (const row of ds.data) {
        const itemMap = new Map();
        itemMap.set(1, { price: row.v, quantity: 1 });
        await encoder.addSnapshot({ timestamp: row.t, items: itemMap });
    }

    console.log("DEBUG: Finished Encoding. Flushing...");
    const output = await encoder.finish();
    const tel = encoder.getTelemetry();

    console.log("DEBUG: Telemetry:", JSON.stringify(tel, null, 2));

    const honestCoreRatio = tel.core_output_bytes > 0 ? (tel.core_input_bytes / tel.core_output_bytes) : 0;
    console.log(`DEBUG: Core Ratio: ${honestCoreRatio}`);
    console.log(`DEBUG: Quar Rate: ${tel.quarantine_rate}`);

    if (honestCoreRatio < 50.0) {
        console.error("FAIL: Ratio < 50.0");
    } else {
        console.log("PASS: Ratio >= 50.0");
    }
}

runTest().catch(e => console.error(e));
