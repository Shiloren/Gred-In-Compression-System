import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateTrendInt, Dataset } from '../scripts/datasets.js';
import { measureSplit, Metrics } from '../scripts/metrics.js';
import { HybridWriter } from '../../src/index.js';
import { GICSv2Encoder } from '../../src/gics/v1_2/encode.js';
import { SeededRNG } from '../scripts/rng.js';
import { createHash } from 'crypto';

function createWriter() {
    // Default to 1.2 for this sensitive benchmark as requested
    if (process.env.GICS_VERSION === '1.2') {
        return new GICSv2Encoder();
    }
    // Fallback or explicit legacy
    return new HybridWriter();
}

// --- CONFIG ---
const OUT_DIR = path.join(process.cwd(), 'bench/results');
const DATASET_BASE = generateTrendInt(100_000, 12345); // Base for most tests

interface SensitiveResult {
    family: string;
    variant: string;
    metrics: Metrics & {
        output_bytes: number;
        ratio_x: number;
        input_mb?: number;
        encode_p50_ms?: number;
        encode_p90_ms?: number;
        // Split-5 Metrics
        core_ratio?: number;
        core_bytes?: number;
        quarantine_rate?: number;
        quarantine_bytes?: number;
    };
    meta: any;
    // New A/B Fields
    context_mode: "OFF" | "ON";
    context_id: string | null;
    append_mode?: string;
    segments?: number;
    context_hit_rate: number | null;
    selected_codecs: { time: number; value: number } | null;
    dataset_hash: string; // [NEW] Verify identity
}

async function main() {
    // Enforce v1.2 routing for this harness run
    process.env.GICS_VERSION = '1.2';

    const timestamp = new Date().toISOString();
    const results: SensitiveResult[] = [];

    console.log(`Starting Ultra-Sensitive Benchmark Suite [${timestamp}] (GICS v1.2 A/B Mode)`);

    const MODES = ['OFF', 'ON'] as const;

    // Track hashes for A/B verification
    const variantHashes: Record<string, string> = {};

    async function runVariant(
        family: string,
        baseVariant: string,
        runner: () => Promise<any>,
        meta: any,
        datasetHash: string
    ) {
        for (const mode of MODES) {
            process.env.GICS_CONTEXT_MODE = mode.toLowerCase(); // "off" or "on"
            GICSv2Encoder.resetSharedContext(); // Ensure fairness: fresh context start

            const res = await runner();

            // Validation: Hash Consistency
            if (!variantHashes[baseVariant]) {
                variantHashes[baseVariant] = datasetHash;
            } else {
                if (variantHashes[baseVariant] !== datasetHash) {
                    throw new Error(`[FATAL] A/B Dataset Mismatch for ${baseVariant}! Hashes differ between modes.`);
                }
            }

            // Extract telemetry (was attached to res metrics by runner)
            const tel = res.telemetry || {};

            results.push({
                family,
                variant: `${baseVariant}_${mode}`, // e.g. "Size_1000_OFF"
                metrics: res, // includes time_encode_ms etc
                meta: meta,
                context_mode: (tel.context_mode_used || mode).toUpperCase(),
                context_id: tel.context_id || null,
                context_hit_rate: tel.context_hit_rate || null,
                append_mode: meta.append_mode || 'n/a',
                segments: meta.chunks || 1,
                selected_codecs: tel.selected_codecs || null,
                dataset_hash: datasetHash
            });
            console.log(`[${family}] ${baseVariant} (${mode}): ${res.ratio_x.toFixed(2)}x (Hash: ${datasetHash.substring(0, 8)}...)`);
        }
    }

    // --- FAMILY A: Chunk Size Sweep ---
    console.log('\n--- FAMILY A: "Chunk" Size (Batch Size) Sweep ---');
    const sizes = [1000, 5000, 10000, 50000, 100_000];
    for (const size of sizes) {
        const ds = generateTrendInt(size, 12345, `CHUNK_${size}`);
        await runVariant('A', `Size_${size}`, () => runEncode(ds), { size_items: size }, ds.checksum);
    }

    // --- FAMILY B: Append Continuity ---
    console.log('\n--- FAMILY B: Append Continuity ---');
    const appendCounts = [1, 2, 4, 8, 16];
    const baseDS = generateTrendInt(10000, 999);
    for (const count of appendCounts) {
        // Run Segment
        await runVariant('B', `Append_Seg_${count}`, () => runAppendSeries(baseDS, count, 'segment'), { chunks: count, append_mode: 'segment' }, baseDS.checksum);
        // Run Continuous
        await runVariant('B', `Append_Cont_${count}`, () => runAppendSeries(baseDS, count, 'continuous'), { chunks: count, append_mode: 'continuous' }, baseDS.checksum);
    }

    // --- FAMILY C: Structural Perturbation ---
    console.log('\n--- FAMILY C: Structural Perturbation ---');
    // 1. Base
    await runVariant('C', 'Base', () => runEncode(DATASET_BASE), {}, DATASET_BASE.checksum);

    // 2. High Volatility (Deterministic)
    const hvRng = new SeededRNG(12345);
    const highVolData = DATASET_BASE.data.map(d => ({ ...d, v: d.v * (hvRng.next() * 10) }));
    // Re-hash manually since we modified data outside generator
    const highVolJson = JSON.stringify(highVolData);
    const highVolHash = sha256(highVolJson);

    const highVolDS: Dataset = {
        ...DATASET_BASE,
        name: 'HighVol',
        data: highVolData,
        size_bytes: Buffer.byteLength(highVolJson),
        checksum: highVolHash
    };
    await runVariant('C', 'HighVolatility', () => runEncode(highVolDS), {}, highVolDS.checksum);

    // 3. Outliers (1%) (Deterministic Logic)
    const outlierData = DATASET_BASE.data.map((d, i) => i % 100 === 0 ? { ...d, v: d.v * 1000 } : d);
    const outlierJson = JSON.stringify(outlierData);
    const outlierHash = sha256(outlierJson);
    const outlierDS: Dataset = {
        ...DATASET_BASE,
        name: 'Outliers1Pct',
        data: outlierData,
        size_bytes: Buffer.byteLength(outlierJson),
        checksum: outlierHash
    };
    await runVariant('C', 'Outliers1Pct', () => runEncode(outlierDS), {}, outlierDS.checksum);

    // --- FAMILY D: Field Isolation ---
    console.log('\n--- FAMILY D: Field Isolation ---');

    const timeOnlyData = DATASET_BASE.data.map(d => ({ t: d.t, v: 0 }));
    const timeQ = JSON.stringify(timeOnlyData);
    const timeHash = sha256(timeQ);
    const timeOnlyDS: Dataset = { ...DATASET_BASE, name: 'TimeOnly', data: timeOnlyData, checksum: timeHash, size_bytes: Buffer.byteLength(timeQ) };
    await runVariant('D', 'TimeOnly', () => runEncode(timeOnlyDS), {}, timeOnlyDS.checksum);

    const valOnlyData = DATASET_BASE.data.map((d, i) => ({ t: i, v: d.v }));
    const valQ = JSON.stringify(valOnlyData);
    const valHash = sha256(valQ);
    const valOnlyDS: Dataset = { ...DATASET_BASE, name: 'ValueOnly', data: valOnlyData, checksum: valHash, size_bytes: Buffer.byteLength(valQ) };
    await runVariant('D', 'ValueOnly', () => runEncode(valOnlyDS), {}, valOnlyDS.checksum);

    // Save
    const outFile = path.join(OUT_DIR, `sensitive-${timestamp.replace(/:/g, '-')}.json`);
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
    console.log(`\nSaved sensitive results to ${outFile}`);
}

function sha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

async function runEncode(ds: Dataset) {
    // 1. Cold Run
    await measureSplit(
        async () => createWriter(),
        async (writer: any) => {
            for (const row of ds.data) {
                const itemMap = new Map();
                itemMap.set(1, { price: row.v, quantity: 1 });
                await writer.addSnapshot({ timestamp: row.t, items: itemMap });
            }
            return await writer.finish();
        }
    );

    // 2. Warm Runs
    const runs = 10;
    const times: number[] = [];
    let lastOutput: Uint8Array = new Uint8Array(0);
    let lastTelemetry: any = null;

    for (let i = 0; i < runs; i++) {
        const measured = await measureSplit(
            async () => createWriter(),
            async (writer: any) => {
                for (const row of ds.data) {
                    const itemMap = new Map();
                    itemMap.set(1, { price: row.v, quantity: 1 });
                    await writer.addSnapshot({ timestamp: row.t, items: itemMap });
                }
                const res = await writer.finish();
                if (writer.getTelemetry) lastTelemetry = writer.getTelemetry();
                return res;
            }
        );
        times.push(measured.metrics.time_encode_ms || measured.metrics.time_ms);
        lastOutput = measured.result;
    }

    // 3. Stats
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.50)];
    const p90 = times[Math.floor(times.length * 0.90)];
    const min = times[0];

    return {
        // Return p50 as the "main" time_encode_ms for compat, but also extra fields
        time_ms: p50, // compat
        time_encode_ms: p50,
        encode_p50_ms: p50,
        encode_p90_ms: p90,
        encode_min_ms: min,
        ram_peak_mb: 0, // Not tracking tightly here
        output_bytes: lastOutput.length,
        ratio_x: ds.size_bytes / lastOutput.length,
        input_mb: ds.size_bytes / 1024 / 1024,
        telemetry: lastTelemetry,

        // Split-5 Hooks
        core_ratio: lastTelemetry?.core_ratio,
        core_bytes: lastTelemetry?.core_output_bytes,
        quarantine_rate: lastTelemetry?.quarantine_rate,
        quarantine_bytes: lastTelemetry?.quarantine_output_bytes
    };
}

async function runAppendSeries(ds: Dataset, chunks: number, mode: 'segment' | 'continuous') {
    // Helper to execute one full series
    const doRun = async () => {
        const start = process.hrtime();
        let totalOutputBytes = 0;
        let telemetry: any = null;

        // For continuous mode: create ONCE
        let sharedWriter: any = null;
        if (mode === 'continuous') {
            sharedWriter = createWriter();
        }

        for (let c = 0; c < chunks; c++) {
            let writer;
            if (mode === 'continuous') {
                writer = sharedWriter;
            } else {
                writer = createWriter();
            }

            // Add data
            const offset = c * 1_000_000;
            for (const row of ds.data) {
                const itemMap = new Map();
                itemMap.set(1, { price: row.v, quantity: 1 });
                await writer.addSnapshot({ timestamp: row.t + offset, items: itemMap });
            }
            // Finish chunk
            // Note: finish() in GICSv1.2 (skeleton) currently resets snapshots.
            // If reusing writer (continuous), context persists.
            const res = await writer.finish();
            totalOutputBytes += res.length;

            if (c === chunks - 1 && writer.getTelemetry) {
                telemetry = writer.getTelemetry();
            }
        }
        const diff = process.hrtime(start);
        const ms = (diff[0] * 1000) + (diff[1] / 1e6);
        return { ms, totalOutputBytes, telemetry };
    };

    // 1. Cold Run
    await doRun();

    // 2. Warm Runs
    const runs = 5; // Append is heavier, 5 runs
    const times: number[] = [];
    let lastRes: any = null;

    for (let i = 0; i < runs; i++) {
        const r = await doRun();
        times.push(r.ms);
        lastRes = r;
    }

    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.50)];
    const p90 = times[Math.floor(times.length * 0.90)];

    const totalInputBytes = ds.size_bytes * chunks;

    return {
        time_setup_ms: 0,
        time_encode_ms: p50,
        encode_p50_ms: p50,
        encode_p90_ms: p90,
        output_bytes: lastRes.totalOutputBytes,
        ratio_x: totalInputBytes / lastRes.totalOutputBytes,
        input_mb: totalInputBytes / 1024 / 1024,
        telemetry: lastRes.telemetry
    };
}

main().catch(console.error);
