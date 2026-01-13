import { exec } from 'child_process';
import { CRITICAL_LIMITS } from './limits.js';
import { CriticalError } from './error-types.js';

export interface SandboxResult {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
}

export function runSandboxed(
    modulePath: string,
    args: string[],
    envMS: NodeJS.ProcessEnv = {},
    timeoutMs: number = CRITICAL_LIMITS.TEST_TIMEOUT_MS
): Promise<SandboxResult> {
    return new Promise((resolve, reject) => {
        const start = Date.now();

        // Construct clear command string
        // Quote the module path in case of spaces
        const cmd = `npx tsx "${modulePath}" ${args.map(a => `"${a}"`).join(' ')}`;

        const child = exec(cmd, {
            env: { ...process.env, ...envMS },
            timeout: timeoutMs > 0 ? timeoutMs : 0,
            cwd: process.cwd() // Explicit CWD
        }, (error, stdout, stderr) => {
            const duration = Date.now() - start;

            // exec "error" is populated if non-zero exit code OR timeout OR launch failure
            // If timeout, error.signal is SIGTERM usually

            let exitCode = 0;
            let signal: NodeJS.Signals | null = null;
            let timedOut = false;

            if (error) {
                exitCode = error.code as number ?? 1;
                signal = error.signal as NodeJS.Signals;

                if (error.killed) timedOut = true; // exec sets killed if timeout hit
            }

            resolve({
                exitCode,
                signal,
                stdout: stdout as string,
                stderr: stderr as string,
                durationMs: duration,
                timedOut
            });
        });
    });
}
