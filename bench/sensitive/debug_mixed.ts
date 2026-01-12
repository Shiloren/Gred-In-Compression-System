
import { GICSv2Encoder } from '../../src/gics/v1_2/encode.js';
import { SeededRNG } from '../scripts/rng.js';
import { calculateBlockMetrics } from '../../src/gics/v1_2/metrics.js';

function generateMixed(rows: number, seed: number) {
    const rng = new SeededRNG(seed);
    const data: any[] = [];
    let currentVal = 1000;

    for (let i = 0; i < rows; i++) {
        const regime = Math.floor(i / 2000) % 2;
        if (regime === 0) {
            currentVal += 10;
        } else {
            currentVal = rng.nextInt(0, 1000000000);
        }
        data.push({ t: i * 1000, v: currentVal });
    }
    return data;
}

async function runTest() {
    console.log("DEBUG: Mixed Test Start");
    const data = generateMixed(20000, 33333);

    // Manual Metric Check on Blocks
    // Blocks 0, 1: Core.
    // Blocks 2, 3: Quar.

    // Check Block 2 (Index 2000-2999)
    const block2Values = data.slice(2000, 3000).map(d => d.v);
    const metrics2 = calculateBlockMetrics(block2Values);
    console.log("Block 2 Metrics (Should be Quar):");
    console.log(`Unique: ${metrics2.unique_ratio}`);
    console.log(`UniqueDelta: ${metrics2.unique_delta_ratio}`);
    console.log(`DoDZero: ${metrics2.dod_zero_ratio}`);

    // If metrics are > 0.85, then CHM logic must catch it.

    process.env.GICS_VERSION = '1.2';
    process.env.GICS_CONTEXT_MODE = 'on';
    GICSv2Encoder.resetSharedContext();

    const encoder = new GICSv2Encoder();
    for (const row of data) {
        const itemMap = new Map();
        itemMap.set(1, { price: row.v, quantity: 1 });
        await encoder.addSnapshot({ timestamp: row.t, items: itemMap });
    }

    const output = await encoder.finish();
    const tel = encoder.getTelemetry();

    console.log(`Total blocks: ${tel.total_blocks}`);
    console.log(`Core blocks: ${tel.blocks.filter((b: any) => b.health === 0).length}`); // Health OK
    console.log(`Quar blocks: ${tel.quarantine_blocks}`);
    console.log(`Quar Rate: ${tel.quarantine_rate}`);
}

runTest().catch(console.error);
