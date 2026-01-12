
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = path.join(process.cwd(), 'audit_artifacts');

interface TraceBlock {
    block_id: number;
    stream_id: number;
    raw_bytes: number;
    total_bytes: number; // Output (Header + Payload)
    payload_bytes: number;
    header_bytes: number;
    routing_decision: string;
    codec_selected: number;
}

interface KPI {
    core_input_bytes: number;
    core_output_bytes: number;
    total_input_bytes: number;
    total_output_bytes: number;
    derived_core_ratio: number;
}

interface Impact {
    quarantine_block_rate: number;
    quarantine_byte_rate: number;
    core_ratio: number;
    global_ratio: number;
}

function verifyDataset(name: string) {
    console.log(`\n>>> VERIFYING: ${name} <<<`);

    // Load Files
    const tracePath = path.join(ARTIFACTS_DIR, `${name}_trace.json`);
    const kpiPath = path.join(ARTIFACTS_DIR, `${name}_kpi.json`);
    const impactPath = path.join(ARTIFACTS_DIR, `${name}_impact.json`);

    if (!fs.existsSync(tracePath) || !fs.existsSync(kpiPath) || !fs.existsSync(impactPath)) {
        console.error(`MISSING ARTIFACTS for ${name}`);
        process.exit(1);
    }

    const trace: TraceBlock[] = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    const kpi: KPI = JSON.parse(fs.readFileSync(kpiPath, 'utf8'));
    const impact: Impact = JSON.parse(fs.readFileSync(impactPath, 'utf8'));

    // Recompute from Trace
    let calc_core_in = 0;
    let calc_core_out = 0;
    let calc_total_in = 0;
    let calc_total_out = 0;
    let calc_quar_blocks = 0;
    let calc_quar_out = 0;

    trace.forEach(b => {
        // Consistency Check: Header + Payload == Total
        if (b.header_bytes + b.payload_bytes !== b.total_bytes) {
            console.error(`[FAIL] Block ${b.block_id} Size Mismatch: Head(${b.header_bytes}) + Pay(${b.payload_bytes}) != Total(${b.total_bytes})`);
            process.exit(1);
        }

        calc_total_in += b.raw_bytes;
        calc_total_out += b.total_bytes;

        if (b.routing_decision === 'CORE') {
            calc_core_in += b.raw_bytes;
            calc_core_out += b.total_bytes;
        } else if (b.routing_decision === 'QUARANTINE') {
            calc_quar_blocks++;
            calc_quar_out += b.total_bytes;
        } else {
            console.error(`[FAIL] Unknown Routing Decision: ${b.routing_decision}`);
            process.exit(1);
        }
    });

    // Validate KPI JSON
    const kpi_core_in = kpi.core_input_bytes;
    const kpi_core_out = kpi.core_output_bytes;

    // Exact Match Checks
    if (calc_core_in !== kpi_core_in) fail(`Core Input Mismatch: Trace(${calc_core_in}) != KPI(${kpi_core_in})`);
    if (calc_core_out !== kpi_core_out) fail(`Core Output Mismatch: Trace(${calc_core_out}) != KPI(${kpi_core_out})`);
    if (calc_total_in !== kpi.total_input_bytes) fail(`Total Input Mismatch: Trace(${calc_total_in}) != KPI(${kpi.total_input_bytes})`);
    if (calc_total_out !== kpi.total_output_bytes) fail(`Total Output Mismatch: Trace(${calc_total_out}) != KPI(${kpi.total_output_bytes})`);

    // Derived Ratio Checks
    const calc_core_ratio = calc_core_out > 0 ? calc_core_in / calc_core_out : 0;
    const diff = Math.abs(calc_core_ratio - kpi.derived_core_ratio);
    if (diff > 0.0000001) fail(`Ratio Mismatch: Calc(${calc_core_ratio}) != KPI(${kpi.derived_core_ratio})`);

    console.log(`[PASS] KPI Verification`);

    // Validate Impact JSON
    const calc_quar_block_rate = calc_quar_blocks / trace.length;
    const calc_quar_byte_rate = calc_total_out > 0 ? calc_quar_out / calc_total_out : 0; // Usage based on output bytes? 
    // Impact report usually uses Output bytes for "Byte Rate" (Start vs End size?)
    // Or Input bytes?
    // Let's check logic in audit_runner.ts:
    // quarantine_byte_rate: telemetry.quarantine_output_bytes / telemetry.total_output_bytes
    // So it is Output Byte Rate.

    if (Math.abs(calc_quar_block_rate - impact.quarantine_block_rate) > 0.000001) {
        fail(`Impact Block Rate Mismatch: Calc(${calc_quar_block_rate}) != Report(${impact.quarantine_block_rate})`);
    }

    if (Math.abs(calc_quar_byte_rate - impact.quarantine_byte_rate) > 0.000001) {
        fail(`Impact Byte Rate Mismatch: Calc(${calc_quar_byte_rate}) != Report(${impact.quarantine_byte_rate})`);
    }

    console.log(`[PASS] Routing Consistency`);
    console.log(`      Core Bytes: ${calc_core_in} -> ${calc_core_out} (x${calc_core_ratio.toFixed(2)})`);
    console.log(`      Quar Blocks: ${calc_quar_blocks}/${trace.length} (${(calc_quar_block_rate * 100).toFixed(1)}%)`);
}

function fail(msg: string) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
}

function main() {
    verifyDataset('ValidVolatile');
    verifyDataset('InvalidStructured');
    verifyDataset('MixedRegime');
    console.log("\n>>> ALL VERIFICATIONS PASSED <<<");
}

main();
