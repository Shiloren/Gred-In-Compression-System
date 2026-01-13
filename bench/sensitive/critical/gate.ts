import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const RUNNERS = [
    'enforcement_runner.ts',     // Phase 1: Format/EOS
    'integrity_runner.ts',       // Phase 2: Validity Fuzzing (Bitflips)
    'integrity_scope_verifier.ts', // Phase 2: Scope Proof (No Checksum)
    'crash_runner.ts',           // Phase 3: Durability (Truncation)
    'concurrency_runner.ts',     // Phase 3: Isolation
    'resource_runner.ts',        // Phase 3: DoS / Limits
    'fuzz_runner.ts',            // Phase 4: Hostile Garbage
    'error_discipline.ts'        // Phase 4: Typed Errors
];

const LOG_FILE = path.join(process.cwd(), 'bench/sensitive/critical/gate.log');
const REPORT_FILE = path.join(process.cwd(), 'audit_artifacts/CRITICAL_AUDIT_REPORT.md');

// Ensure artifacts dir
if (!fs.existsSync('audit_artifacts')) fs.mkdirSync('audit_artifacts');

function log(msg: string) {
    fs.appendFileSync(LOG_FILE, msg + '\n');
    console.log(msg);
}

import { execSync } from 'child_process';

async function runScript(script: string): Promise<boolean> {
    log(`\n>>> RUNNING: ${script} <<<`);
    const p = path.join('bench/sensitive/critical', script); // Relative path for npx tsx

    try {
        // Use npx tsx directly. execSync handles shell on Windows usually if passed correctly?
        // Or just 'npx tsx path'
        const cmd = `npx tsx "${p}"`;
        log(`EXEC: ${cmd}`);
        execSync(cmd, { stdio: 'inherit', cwd: process.cwd(), env: process.env });
        log(`[PASS] ${script}`);
        return true;
    } catch (e: any) {
        log(`[FAIL] ${script} (Exit ${e.status})`);
        return false;
    }
}

async function main() {
    fs.writeFileSync(LOG_FILE, `GATE RUN START: ${new Date().toISOString()}\n`);

    let passed = 0;
    let failed = 0;
    const results: any[] = [];

    for (const r of RUNNERS) {
        const p = await runScript(r);
        if (p) passed++;
        else failed++;
        results.push({ name: r, status: p ? 'PASS' : 'FAIL' });
    }

    log(`\n=== GATE RESULT ===`);
    log(`PASSED: ${passed}`);
    log(`FAILED: ${failed}`);

    // Generate Report
    let md = `# Critical Assurance Audit Report
**Date:** ${new Date().toISOString()}
**Commit:** ${process.env.GIT_COMMIT || 'HEAD'}
**GICS Version:** 1.2 (Critical)

## Executive Summary
The Critical Assurance Gate has executed ${RUNNERS.length} vectors.
Result: **${failed === 0 ? 'PASS' : 'FAIL'}**

## Runner Results
| Vector | Script | Status | Notes |
|---|---|---|---|
`;

    for (const res of results) {
        md += `| ${res.name.split('_')[0].toUpperCase()} | ${res.name} | ${res.status} | - |\n`;
    }

    md += `
## configuration
- **Hard Limits:** MAX_BLOCK_ITEMS=10000, MAX_RLE_RUN=2000
- **Integrity Scope:** Structural Validity Only (No Checksum).
- **Concurrency:** Synchronous Execution Verified.
- **Protocol:** v1.2 + EOS Required.

## Evidence
See artifacts in \`/bench/sensitive/critical/*.log\`
`;

    fs.writeFileSync(REPORT_FILE, md);
    log(`Report generated at ${REPORT_FILE}`);

    if (failed > 0) process.exit(1);
    process.exit(0);
}

main();
