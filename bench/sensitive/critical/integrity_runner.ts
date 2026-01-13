import { runSandboxed } from './common/spawn.js';
import { CriticalError } from './common/error-types.js';
import * as path from 'path';
import * as fs from 'fs';

const WORKER_PATH = path.join(process.cwd(), 'bench/sensitive/critical/integrity_worker.ts');
const LOG_FILE = path.join(process.cwd(), 'bench/sensitive/critical/integrity.log');

// Clear log
fs.writeFileSync(LOG_FILE, '');

function log(msg: string) {
    fs.appendFileSync(LOG_FILE, msg + '\n');
    console.log(msg);
}

function error(msg: string) {
    fs.appendFileSync(LOG_FILE, 'ERROR: ' + msg + '\n');
    console.error(msg);
}

async function runScenario(type: string, size: number, mutation: string, desc: string): Promise<boolean> {
    const env = {
        TYPE: type,
        SIZE: size.toString(),
        SEED: '12345',
        MUTATION_MODE: mutation,
        MUTATION_SEED: '999'
    };

    log(`Running: ${desc} ...`);

    try {
        const res = await runSandboxed(WORKER_PATH, [], env);

        // Case 1: Normal Run (Expect 0)
        if (mutation === 'NONE') {
            if (res.exitCode === 0) {
                log(`  PASS: Clean run success.`);
                return true;
            } else {
                error(`  FAIL: Clean run crashed. Code=${res.exitCode}\n${res.stderr}`);
                return false;
            }
        }

        // Case 2: Mutation Run (Expect 101 or 102, NEVER 0)
        else {
            if (res.exitCode === 0) {
                error(`  FAIL: Silent Corruption! Worker accepted invalid data.`);
                return false;
            }
            else if (res.exitCode === 101) {
                log(`  PASS: Detected Corruption (IntegrityError).`);
                return true;
            }
            else if (res.exitCode === 102) {
                log(`  PASS: Detected Truncation (IncompleteError).`);
                return true;
            }
            else {
                // Crashed with generic error (stack overflow, null ptr, etc) -> FAIL
                error(`  FAIL: Uncontrolled Crash on hostile input. Code=${res.exitCode}\nSTDOUT: ${res.stdout}\nSTDERR: ${res.stderr}`);
                return false;
            }
        }
    } catch (e: any) {
        error(`  FAIL: Sandbox error: ${e.message}`);
        return false;
    }
}

async function main() {
    console.log("=== INTEGRITY SUITE ===");
    let pass = true;

    // 1. Normal Large
    pass &&= await runScenario('NORMAL', 10000, 'NONE', 'Baseline Normal (10k)');
    // 2. Mixed
    pass &&= await runScenario('MIXED', 10000, 'NONE', 'Baseline Mixed (10k)');
    // 3. Header Attack
    pass &&= await runScenario('NORMAL', 1000, 'HEADER', 'Header Corruption Attack');
    // 4. Payload Attack
    pass &&= await runScenario('NORMAL', 1000, 'PAYLOAD', 'Payload Corruption Attack');
    // 5. Truncation handled safely?
    pass &&= await runScenario('NORMAL', 1000, 'TRUNCATE', 'Mid-stream Truncation');

    if (!pass) {
        error("Integrity Suite FAILED");
        process.exit(1);
    }
    log("Integrity Suite PASSED");
    process.exit(0);
}

main();
