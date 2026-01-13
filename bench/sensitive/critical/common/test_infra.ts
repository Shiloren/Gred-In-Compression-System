import { CriticalRNG } from './rng.js';
import { runSandboxed } from './spawn.js';
import { LimitExceededError } from './error-types.js';
import * as path from 'path';

async function main() {
    console.log("Verifying Critical Infrastructure...");

    // 1. RNG
    const rng = new CriticalRNG(12345);
    const v1 = rng.nextInt(0, 100);
    const rng2 = new CriticalRNG(12345);
    const v2 = rng2.nextInt(0, 100);
    if (v1 !== v2) throw new Error("RNG Nondeterministic!");
    console.log(`[PASS] RNG Determinism (${v1} == ${v2})`);

    // 2. Errors
    try {
        throw new LimitExceededError("Test");
    } catch (e) {
        if (!(e instanceof LimitExceededError)) throw new Error("Error typing failed");
        if (e.name !== 'LimitExceededError') throw new Error("Error definition failed");
    }
    console.log("[PASS] Error Taxonomy");

    // 3. Sandbox
    const workerPath = path.join(process.cwd(), 'bench/sensitive/critical/common/dummy_worker.ts');
    // Create dummy worker
    const fs = await import('fs');
    fs.writeFileSync(workerPath, 'console.log("Hello from Sandbox"); process.exit(42);');

    const res = await runSandboxed(workerPath, []);
    if (res.exitCode !== 42) throw new Error(`Sandbox exit code mismatch: ${res.exitCode}`);
    if (!res.stdout.includes("Hello from Sandbox")) throw new Error("Sandbox stdout mismatch");
    console.log("[PASS] Sandbox Execution");

    fs.unlinkSync(workerPath);
    console.log("ALL INFRASTRUCTURE VERIFIED.");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
