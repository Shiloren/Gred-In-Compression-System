
import { HybridWriter } from './src/index.js';
import { performance } from 'perf_hooks';

// Helper to format numbers
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

async function runBenchmarks() {
    console.log(`\n===============================================================`);
    console.log(`🚀 GICS PERFORMANCE BENCHMARK SUITE`);
    console.log(`===============================================================\n`);

    const tp = await runThroughputTest();
    console.log(`Ingested ${fmt(tp.count)} points in ${tp.time.toFixed(2)}ms`);
    console.log(`👉 Throughput: ${fmt(Math.round(tp.ops))} points/sec\n`);

    await runCompressionTest();

    console.log(`\n✅ Benchmarks Completed.`);
}

async function runThroughputTest() {
    console.log(`[TEST 1] "The Flash Flood" - Throughput Saturation`);
    console.log(`--------------------------------------------------`);

    const COUNT = 1_000_000;
    const BATCH_SIZE = 10_000;

    // Generate data
    const items = new Map<number, { price: number; quantity: number }>();
    for (let i = 0; i < BATCH_SIZE; i++) {
        items.set(i, { price: Math.floor(Math.random() * 10000), quantity: 100 });
    }

    const writer = new HybridWriter();
    const start = performance.now();

    for (let i = 0; i < COUNT / BATCH_SIZE; i++) {
        await writer.addSnapshot({
            timestamp: 1700000000 + i,
            items: items
        });
    }

    const ingestTime = performance.now() - start;
    const opsPerSec = (COUNT / ingestTime) * 1000;

    return { count: COUNT, time: ingestTime, ops: opsPerSec };
}

async function runCompressionTest() {
    console.log(`[TEST 2] "The Archive" - Compression Efficiency`);
    console.log(`--------------------------------------------------`);

    // Scenario: 7 Days, High Volatility (Mixed)
    const ITEMS = 1000;
    const SNAPSHOTS = 168; // 7 days * 24h
    const TOTAL_POINTS = ITEMS * SNAPSHOTS;
    const RAW_SIZE_EST = TOTAL_POINTS * 12;

    // Generate data
    const items = new Map<number, { price: number; quantity: number }>();
    for (let i = 0; i < ITEMS; i++) items.set(i, { price: 1000, quantity: 50 });

    const snapshotsData = [];
    for (let i = 0; i < SNAPSHOTS; i++) {
        for (let j = 0; j < ITEMS; j++) {
            if (j < ITEMS * 0.2) {
                if (Math.random() < 0.5) items.get(j)!.price += Math.floor(Math.random() * 10 - 5);
            } else {
                if (Math.random() < 0.01) items.get(j)!.price += Math.floor(Math.random() * 2 - 1);
            }
        }
        const snapshotItems = new Map();
        for (let [k, v] of items) snapshotItems.set(k, { ...v });
        snapshotsData.push({ timestamp: 1700000000 + (i * 3600), items: snapshotItems });
    }

    const writer = new HybridWriter();
    for (const s of snapshotsData) await writer.addSnapshot(s);

    const start = performance.now();
    const compressed = await writer.finish();
    const time = performance.now() - start;

    const ratio = RAW_SIZE_EST / compressed.length;

    console.log(`Raw Size (Est):  ${fmt(RAW_SIZE_EST)} bytes`);
    console.log(`GICS Size:       ${fmt(compressed.length)} bytes`);
    console.log(`Compression Time: ${time.toFixed(2)}ms`);
    console.log(`👉 Ratio:        ${ratio.toFixed(2)}x`);
}

runBenchmarks();
