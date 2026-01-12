
import { HybridWriter } from './src/index.js';
import { brotliCompressSync, gzipSync, constants } from 'zlib';
import { performance } from 'perf_hooks';

// Helper to format numbers
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
const sizeFmt = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function runArena() {
    console.log(`\n===============================================================`);
    console.log(`⚔️  THE ARENA: GICS vs THE WORLD`);
    console.log(`===============================================================\n`);

    await battle("Scenario A: Market History (7 Days)", 1000, 168); // 7 days hourly
    await battle("Scenario B: Massive Scale (30 Days)", 5000, 720); // 30 days hourly
}

async function battle(name: string, itemsCount: number, snapshotsCount: number) {
    console.log(`\n[${name}]`);
    console.log(`Context: ${itemsCount} Items x ${snapshotsCount} Snapshots = ${fmt(itemsCount * snapshotsCount)} points.`);
    console.log(`---------------------------------------------------------------------------------`);
    console.log(`| Candidate       | Size       | Ratio   | Write Time | Read Time (Est) |`);
    console.log(`|-----------------|------------|---------|------------|-----------------|`);

    // 1. GENERATE DATA
    const data = generateData(itemsCount, snapshotsCount);

    // 2. BASELINE: JSON
    const jsonStart = performance.now();
    const jsonStr = JSON.stringify(data);
    const jsonTime = performance.now() - jsonStart;
    const jsonSize = Buffer.byteLength(jsonStr);

    printRow("JSON (Raw)", jsonSize, jsonSize, jsonTime);

    // 3. CHALLENGER: JSON + GZIP
    const gzipStart = performance.now();
    const gzipBuf = gzipSync(jsonStr);
    const gzipTime = performance.now() - gzipStart; // Ops, this includes JSON stringify time ideally, but let's count compression
    printRow("JSON + Gzip", gzipBuf.length, jsonSize, gzipTime + jsonTime);

    // 4. CHALLENGER: JSON + BROTLI
    const brStart = performance.now();
    const brBuf = brotliCompressSync(jsonStr);
    const brTime = performance.now() - brStart;
    printRow("JSON + Brotli", brBuf.length, jsonSize, brTime + jsonTime);

    // 5. HERO: GICS
    const gicsStart = performance.now();
    const writer = new HybridWriter();
    // Convert generic data structure back to GICS Snapshots
    for (const s of data) {
        const itemMap = new Map();
        for (const item of s.items) itemMap.set(item.id, { price: item.p, quantity: item.q });
        await writer.addSnapshot({ timestamp: s.ts, items: itemMap });
    }
    const gicsBuf = await writer.finish();
    const gicsTime = performance.now() - gicsStart;

    printRow("GICS v1.1", gicsBuf.length, jsonSize, gicsTime);
    console.log(`---------------------------------------------------------------------------------`);
}

function printRow(name: string, size: number, baselineSize: number, time: number) {
    const ratio = (baselineSize / size).toFixed(1) + "x";
    const sizeStr = sizeFmt(size).padEnd(10);
    const timeStr = time.toFixed(0) + "ms";
    console.log(`| ${name.padEnd(15)} | ${sizeStr} | ${ratio.padEnd(7)} | ${timeStr.padEnd(10)} | N/A             |`);
}

function generateData(itemsCount: number, snapshotsCount: number) {
    const data = [];
    // Init prices
    const prices = new Array(itemsCount).fill(0).map(() => 1000 + Math.random() * 1000);

    for (let i = 0; i < snapshotsCount; i++) {
        const snapshotItems = [];
        for (let j = 0; j < itemsCount; j++) {
            // Mutate
            if (Math.random() < 0.2) prices[j] += Math.floor(Math.random() * 20 - 10);
            snapshotItems.push({ id: j, p: prices[j], q: 100 });
        }
        data.push({ ts: 1700000000 + i * 3600, items: snapshotItems });
    }
    return data;
}

runArena();
