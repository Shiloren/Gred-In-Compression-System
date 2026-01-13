
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const ARTIFACTS_DIR = path.join(process.cwd(), 'bench_postfreeze_artifacts');

function sha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}


function verifyRun(baseDir: string, name: string) {
    const tracePath = path.join(baseDir, `${name}_trace.json`);
    const kpiPath = path.join(baseDir, `${name}_kpi.json`);

    if (!fs.existsSync(tracePath) || !fs.existsSync(kpiPath)) {
        throw new Error(`Missing artifacts for ${name} in ${baseDir}`);
    }

    const trace = JSON.parse(fs.readFileSync(tracePath, 'utf-8'));
    const kpi = JSON.parse(fs.readFileSync(kpiPath, 'utf-8'));

    let calcCoreBytes = 0;
    let calcTotalOut = 0;

    trace.forEach((b: any) => {
        calcTotalOut += b.total_bytes;
        if (b.routing_decision === 'CORE') {
            calcCoreBytes += b.total_bytes;
        }
        if (b.header_bytes + b.payload_bytes !== b.total_bytes) {
            throw new Error(`Block ${b.block_id} integrity fail`);
        }
    });

    if (Math.abs(calcCoreBytes - kpi.core_output_bytes) > 0) {
        throw new Error(`[${name}] Core Output Bytes Mismatch`);
    }

    // KPI Total vs Trace Sum
    // We only Warn here as per previous logic
    const diff = calcTotalOut - kpi.total_output_bytes;
    if (diff !== 0 && Math.abs(diff) > 100) {
        throw new Error(`[${name}] Large byte accounting discrepancy`);
    }
}

function compareRuns(name: string) {
    const dirA = path.join(ARTIFACTS_DIR, 'runA');
    const dirB = path.join(ARTIFACTS_DIR, 'runB');

    // 1. Compare Hashes
    const hashA = fs.readFileSync(path.join(dirA, `${name}_encoded.sha256`), 'utf-8').trim();
    const hashB = fs.readFileSync(path.join(dirB, `${name}_encoded.sha256`), 'utf-8').trim();

    if (hashA !== hashB) {
        throw new Error(`[${name}] DETERMINISM FAIL: Hash mismatch A vs B`);
    } else {
        console.log(`[PASS] ${name} Determinism (SHA256 Match)`);
    }

    // 2. Compare Traces Byte-for-Byte
    const traceA = fs.readFileSync(path.join(dirA, `${name}_trace.json`), 'utf-8');
    const traceB = fs.readFileSync(path.join(dirB, `${name}_trace.json`), 'utf-8');

    if (traceA !== traceB) {
        throw new Error(`[${name}] TRACE MISMATCH A vs B`);
    }
}

function main() {
    const datasets = ['Structured_TrendNoise', 'Mixed_RegimeSwitch', 'HighEntropy_Random'];


    // --- CONTRACT THRESHOLDS ---
    const THRESHOLDS: Record<string, { metric: string, min: number }> = {
        'Structured_TrendNoise': { metric: 'core_ratio', min: 100.0 },
        'Mixed_RegimeSwitch': { metric: 'global_ratio', min: 5.0 },
        'HighEntropy_Random': { metric: 'global_ratio', min: 2.5 }
    };

    try {
        for (const ds of datasets) {
            console.log(`Verifying ${ds}...`);
            // Verify A
            verifyRun(path.join(ARTIFACTS_DIR, 'runA'), ds);
            // Verify B
            verifyRun(path.join(ARTIFACTS_DIR, 'runB'), ds);
            // Compare
            compareRuns(ds);

            // Check Thresholds
            const kpi = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, 'runA', `${ds}_kpi.json`), 'utf-8'));
            const rule = THRESHOLDS[ds];
            if (rule) {
                // kpi.core_ratio or kpi.global_ratio
                const val = kpi[rule.metric];
                console.log(`[CHECK] ${ds} ${rule.metric}: ${val.toFixed(2)} (Min: ${rule.min})`);
                if (val < rule.min) {
                    throw new Error(`[CONTRACT FAIL] ${ds} ${rule.metric} ${val.toFixed(2)} < ${rule.min}`);
                }
            }
        }
        console.log("\nVERIFICATION SUCCESSFUL: A/B MATCH & INTEGRITY PASS & CONTRACT MET");
    } catch (e) {

        console.error("VERIFICATION FAILED", e);
        process.exit(1);
    }
}


main();
