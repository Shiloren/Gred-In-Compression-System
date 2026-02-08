import { Snapshot } from '../../src/gics-types.js';

export function createSnapshot(timestamp: number, itemId: number, price: number, quantity: number): Snapshot {
    return {
        timestamp,
        items: new Map([[itemId, { price, quantity }]])
    };
}

export function createSnapshots(count: number, startTs: number, itemId: number): Snapshot[] {
    const snaps: Snapshot[] = [];
    for (let i = 0; i < count; i++) {
        const items = new Map();
        items.set(itemId, { price: 100 + i, quantity: 10 });
        snaps.push({ timestamp: startTs + i * 1000, items });
    }
    return snaps;
}
