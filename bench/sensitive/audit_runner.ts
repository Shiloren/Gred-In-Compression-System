
import { GICSv2Encoder } from '../../src/gics/v1_2/encode.js';
import { GICSv2Decoder } from '../../src/gics/v1_2/decode.js';
import { generateVolatileInt, Dataset } from '../scripts/datasets.js';
import { SeededRNG } from '../scripts/rng.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// --- ARTIFACT CONFIG ---
const AUDIT_DIR = path.join(process.cwd(), 'audit_artifacts');
if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

const RUN_ID = `AUDIT-${Date.now()}`;
const COMMIT_HASH = process.env.GIT_COMMIT || "HEAD-simulated";

// --- DATASET GENERATORS (Reused for Consistency) ---
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
    return { name: 'ValidVolatile', seed, rows, data, checksum: sha256(json), size_bytes: Buffer.byteLength(json) };
}

function generateInvalidStructured(rows: number, seed: number): Dataset {
    const rng = new SeededRNG(seed);
    const data: any[] = [];
    for (let i = 0; i < rows; i++) {
        const t = rng.nextInt(0, 2000000000);
        data.push({ t, v: rng.nextInt(0, 1_000_000_000) });
    }
    const json = JSON.stringify(data);
    return { name: 'InvalidStructured', seed, rows, data, checksum: sha256(json), size_bytes: Buffer.byteLength(json) };
}

function generateMixed(rows: number, seed: number): Dataset {
    const rng = new SeededRNG(seed);
    const data: any[] = [];
    let currentVal = 1000;
    for (let i = 0; i < rows; i++) {
        const regime = Math.floor(i / 2000) % 2;
        if (regime === 0) { currentVal += 10; }
        else { currentVal = rng.nextInt(0, 1000000000); }
        data.push({ t: i * 1000, v: currentVal });
    }
    const json = JSON.stringify(data);
    return { name: 'MixedRegime', seed, rows, data, checksum: sha256(json), size_bytes: Buffer.byteLength(json) };
}

// --- EXECUTION ---

async function runAuditForDataset(ds: Dataset) {
    console.log(`>>> Auditing: ${ds.name} <<<`);

    process.env.GICS_VERSION = '1.2';
    process.env.GICS_CONTEXT_MODE = 'on';
    process.env.GICS_TEST_RUN_ID = RUN_ID;
    GICSv2Encoder.resetSharedContext();

    const encoder = new GICSv2Encoder();
    const startTime = Date.now();

    for (const row of ds.data) {
        const itemMap = new Map();
        itemMap.set(1, { price: row.v, quantity: 1 });
        await encoder.addSnapshot({ timestamp: row.t, items: itemMap });
    }

    const output = await encoder.finish(); // Flushes remaining
    const telemetry = encoder.getTelemetry(); // Instrumented with blockStats

    // --- INTEGRITY CHECK (BIT-EXACT ROUNDTRIP) ---
    // Step 2 Compliance: encode -> decode -> compare
    GICSv2Decoder.resetSharedContext(); // Ensure fresh context matching the encoder run
    const decoder = new GICSv2Decoder(output);
    const decodedSnapshots = await decoder.getAllSnapshots();

    if (decodedSnapshots.length !== ds.data.length) {
        console.error(`[FAIL] Roundtrip Count Mismatch: Input(${ds.data.length}) != Output(${decodedSnapshots.length})`);
        process.exit(1);
    }

    for (let i = 0; i < ds.data.length; i++) {
        const original = ds.data[i];
        const reconstructed = decodedSnapshots[i];

        // Check Metadata
        if (reconstructed.timestamp !== original.t) {
            console.error(`[FAIL] Integrity Mismatch at Index ${i}:
                Expected Time: ${original.t}
                Actual Time:   ${reconstructed.timestamp}`);
            process.exit(1);
        }

        // Check Value (Item 1)
        const recVal = reconstructed.items.get(1)?.price;
        if (recVal !== original.v) {
            console.error(`[FAIL] Integrity Mismatch at Index ${i}:
                Expected Val: ${original.v}
                Actual Val:   ${recVal}`);
            process.exit(1);
        }
    }
    console.log(`Integrity Check: MATCH`);

    // --- 1. EXECUTION CONTEXT ---
    const context = {
        run_id: RUN_ID,
        timestamp: new Date().toISOString(),
        dataset: { name: ds.name, checksum: ds.checksum, rows: ds.rows },
        env: {
            platform: os.platform(),
            arch: os.arch(),
            node: process.version
        },
        config: {
            gics_version: '1.2',
            commit: COMMIT_HASH
        }
    };
    fs.writeFileSync(path.join(AUDIT_DIR, `${ds.name}_context.json`), JSON.stringify(context, null, 2));

    // --- 2. BLOCK TRACE ---
    const trace = telemetry.blocks.map((b: any, idx: number) => ({
        block_id: idx,
        stream_id: b.stream_id,
        raw_bytes: b.raw_bytes,
        total_bytes: b.bytes,
        payload_bytes: b.payload_bytes,
        header_bytes: b.header_bytes,

        // Routing
        routing_decision: b.params?.decision || (b.health === 2 ? 'QUARANTINE' : 'CORE'),
        routing_reason: b.params?.reason || 'None',

        // Metrics
        entropy: b.metrics.unique_ratio,
        delta_entropy: b.metrics.unique_delta_ratio,
        dod_zero_run_rate: b.metrics.dod_zero_ratio,

        // Codec
        codec_selected: b.codec, // Number
        codec_name: codecName(b.codec)
    }));
    fs.writeFileSync(path.join(AUDIT_DIR, `${ds.name}_trace.json`), JSON.stringify(trace, null, 2));

    // --- 3. COMPRESSION ATTRIBUTION ---
    // Core Savings = Sum(Raw - Payload - Header) for Core Blocks
    let totalCoreRaw = 0;
    let savingsRLE = 0;
    let savingsVarint = 0;
    let savingsDict = 0;
    let savingsBitpack = 0;
    let overheadHeaders = 0; // Negative saving

    trace.forEach((b: any) => {
        if (b.routing_decision === 'CORE') {
            totalCoreRaw += b.raw_bytes;
            const saved = b.raw_bytes - b.payload_bytes;

            // Codecs: 3=RLE_ZIGZAG, 4=RLE_DOD, 6=DICT. 1,5=VARINT. 2=BITPACK.
            if (b.codec_selected === 4 || b.codec_selected === 3) savingsRLE += saved;
            else if (b.codec_selected === 6) savingsDict += saved;
            else if (b.codec_selected === 2) savingsBitpack += saved;
            else savingsVarint += saved; // 1, 5

            overheadHeaders += b.header_bytes; // This reduces net saving
        }
    });

    const totalSavedGross = savingsRLE + savingsVarint + savingsDict + savingsBitpack;
    const netSaved = totalSavedGross - overheadHeaders;

    // Check divide by zero
    const attrReport = {
        total_core_raw_bytes: totalCoreRaw,
        net_saved_bytes: netSaved,
        attribution: {
            rle_dod_percent: totalSavedGross > 0 ? (savingsRLE / totalSavedGross) * 100 : 0,
            varint_percent: totalSavedGross > 0 ? (savingsVarint / totalSavedGross) * 100 : 0,
            dict_percent: totalSavedGross > 0 ? (savingsDict / totalSavedGross) * 100 : 0,
            bitpack_percent: totalSavedGross > 0 ? (savingsBitpack / totalSavedGross) * 100 : 0,
            header_overhead_bytes: overheadHeaders
        }
    };
    fs.writeFileSync(path.join(AUDIT_DIR, `${ds.name}_attribution.json`), JSON.stringify(attrReport, null, 2));

    // --- 4. QUARANTINE IMPACT ---
    const totalOutputBytes = telemetry.core_output_bytes + telemetry.quarantine_output_bytes;
    const quarBlocks = trace.filter((b: any) => b.routing_decision === 'QUARANTINE');
    const impact = {
        quarantine_block_rate: quarBlocks.length / trace.length,
        quarantine_byte_rate: totalOutputBytes > 0 ? (telemetry.quarantine_output_bytes / totalOutputBytes) : 0,
        // "Impact on core ratio" -> Compare Core Ratio vs Global Ratio
        core_ratio: telemetry.core_ratio,
        global_ratio: telemetry.total_blocks > 0 ? ((telemetry.core_input_bytes + telemetry.quarantine_input_bytes) / (telemetry.core_output_bytes + telemetry.quarantine_output_bytes)) : 0
    };
    fs.writeFileSync(path.join(AUDIT_DIR, `${ds.name}_impact.json`), JSON.stringify(impact, null, 2));

    // --- 5. KPI VERIFICATION ---
    const kpi = {
        core_input_bytes: telemetry.core_input_bytes,
        core_output_bytes: telemetry.core_output_bytes,
        total_input_bytes: telemetry.core_input_bytes + telemetry.quarantine_input_bytes,
        total_output_bytes: telemetry.core_output_bytes + telemetry.quarantine_output_bytes,
        derived_core_ratio: telemetry.core_output_bytes > 0 ? telemetry.core_input_bytes / telemetry.core_output_bytes : 0
    };
    fs.writeFileSync(path.join(AUDIT_DIR, `${ds.name}_kpi.json`), JSON.stringify(kpi, null, 2));

    // --- CONSOLE REPORT (Step 4 Compliance) ---
    console.log(`KPI TRIAD [${ds.name}]:
    core_ratio:           ${impact.core_ratio.toFixed(4)}
    quarantine_byte_rate: ${impact.quarantine_byte_rate.toFixed(4)}
    global_ratio:         ${impact.global_ratio.toFixed(4)}`);
    console.log(`HIGH core_ratio can coexist with LOW global_ratio by design when entropy is quarantined.`);
}

function codecName(id: number): string {
    switch (id) {
        case 0: return 'NONE';
        case 1: return 'VARINT_DELTA';
        case 2: return 'BITPACK_DELTA';
        case 3: return 'RLE_ZIGZAG';
        case 4: return 'RLE_DOD';
        case 5: return 'DOD_VARINT';
        case 6: return 'DICT_VARINT';
        default: return `UNKNOWN_${id}`;
    }
}

async function main() {
    console.log("Starting Mandatory Audit...");

    // 1. ValidVolatile
    await runAuditForDataset(generateTrendWithNoise(10000, 11111));

    // 2. InvalidStructured
    await runAuditForDataset(generateInvalidStructured(10000, 22222));

    // 3. MixedRegime
    await runAuditForDataset(generateMixed(20000, 33333));

    console.log("Audit Complete. Artifacts in /audit_artifacts");
}

main().catch(console.error);
