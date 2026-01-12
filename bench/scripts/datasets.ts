import { createHash } from 'crypto';
import { SeededRNG } from './rng.js';

export interface Dataset {
    name: string;
    seed: number;
    rows: number;
    data: any[]; // The actual payload (array of objects)
    checksum: string;
    size_bytes: number;
}

export function generateTrendInt(rows: number, seed: number, nameOverride: string = 'TS_TREND_INT'): Dataset {
    const rng = new SeededRNG(seed);
    const data: any[] = [];
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

export function generateTrendIntLarge(seed: number): Dataset {
    // 2 Million rows should be approx 50MB+ of JSON
    return generateTrendInt(2_000_000, seed, 'TS_TREND_INT_LARGE');
}

export function generateVolatileInt(rows: number, seed: number): Dataset {
    const rng = new SeededRNG(seed);
    const data: any[] = [];
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

function sha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}
