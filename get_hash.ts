
import { gics_encode } from './src/index.js';
import { GICSv2Encoder } from './src/gics/v1_2/encode.js';
import { Snapshot } from './src/gics-types.js';
import crypto from 'crypto';
import * as fs from 'fs';

class LGC {
    private state: number;
    constructor(seed: number) { this.state = seed; }
    next(): number {
        this.state = (this.state * 1664525 + 1013904223) % 4294967296;
        return this.state;
    }
    nextFloat(): number {
        return this.next() / 4294967296;
    }
    nextRange(min: number, max: number): number {
        return min + Math.floor(this.nextFloat() * (max - min));
    }
}

async function run() {
    process.env.GICS_VERSION = '1.2';
    process.env.GICS_CONTEXT_MODE = 'off';
    GICSv2Encoder.resetSharedContext();

    const rng = new LGC(123456789);
    const snapshots: Snapshot[] = [];
    const baseTime = 1700000000;

    for (let i = 0; i < 1000; i++) {
        const map = new Map<number, { price: number; quantity: number }>();
        const numItems = rng.nextRange(1, 21);
        for (let j = 0; j < numItems; j++) {
            const id = rng.nextRange(1, 101);
            const price = rng.nextRange(1000, 50000);
            const quantity = rng.nextRange(1, 1000);
            map.set(id, { price, quantity });
        }
        snapshots.push({ timestamp: baseTime + (i * 60), items: map });
    }

    const encoded = await gics_encode(snapshots);
    const hash = crypto.createHash('sha256').update(encoded).digest('hex');
    fs.writeFileSync('hash_clean.txt', hash, 'utf8');
    console.log("Hash written to hash_clean.txt");
}

run();
