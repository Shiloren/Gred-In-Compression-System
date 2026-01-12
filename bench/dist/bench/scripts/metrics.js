import { performance } from 'perf_hooks';
export async function measure(fn) {
    const startMem = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    const endMem = process.memoryUsage().heapUsed;
    // Crude peak approximation: diff or current if higher. 
    // For specialized peak tracking, we'd need a sampler, but this fits the spec "ram_peak_mb" requirement for now.
    const peak = Math.max(endMem, startMem);
    return {
        result,
        metrics: {
            time_ms: end - start,
            ram_peak_mb: peak / 1024 / 1024
        }
    };
}
// Measures setup and action phases separately
export async function measureSplit(setupFn, actionFn) {
    const startMem = process.memoryUsage().heapUsed;
    const startSetup = performance.now();
    const context = await setupFn();
    const endSetup = performance.now();
    const startAction = performance.now();
    const result = await actionFn(context);
    const endAction = performance.now();
    const endMem = process.memoryUsage().heapUsed;
    const peak = Math.max(endMem, startMem);
    return {
        result,
        metrics: {
            time_ms: (endSetup - startSetup) + (endAction - startAction),
            time_setup_ms: endSetup - startSetup,
            time_encode_ms: endAction - startAction,
            ram_peak_mb: peak / 1024 / 1024
        }
    };
}
export function stats(values) {
    if (values.length === 0)
        return { median: 0, p95: 0, p99: 0, min: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const p = (pct) => sorted[Math.floor(sorted.length * pct)];
    return {
        median: p(0.50),
        p95: p(0.95),
        p99: p(0.99),
        min: sorted[0],
        max: sorted[sorted.length - 1]
    };
}
