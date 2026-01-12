import { createHash } from 'crypto';
import { SeededRNG } from './rng.js';
export function generateTrendInt(rows, seed, nameOverride = 'TS_TREND_INT') {
    const rng = new SeededRNG(seed);
    const data = [];
    let current = 1000;
    for (let i = 0; i < rows; i++) {
        // Monotonic-ish trend
        const delta = rng.nextInt(-1, 5); // Bias positive
        current += delta;
        data.push({ t: i, v: current });
    }
    const json = JSON.stringify(data);
    return {
        name: nameOverride,
        seed,
        rows,
        data,
        checksum: sha256(json),
        size_bytes: Buffer.byteLength(json)
    };
}
export function generateTrendIntLarge(seed) {
    // 2 Million rows should be approx 50MB+ of JSON
    return generateTrendInt(2_000_000, seed, 'TS_TREND_INT_LARGE');
}
export function generateVolatileInt(rows, seed) {
    const rng = new SeededRNG(seed);
    const data = [];
    let current = 1000;
    for (let i = 0; i < rows; i++) {
        // High volatility
        const delta = rng.nextInt(-100, 100);
        current += delta;
        data.push({ t: i, v: current });
    }
    const json = JSON.stringify(data);
    return {
        name: 'TS_VOLATILE_INT',
        seed,
        rows,
        data,
        checksum: sha256(json),
        size_bytes: Buffer.byteLength(json)
    };
}
function sha256(content) {
    return createHash('sha256').update(content).digest('hex');
}
