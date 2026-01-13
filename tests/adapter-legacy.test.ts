import { describe, it, expect } from 'vitest';
import { Snapshot } from '../gics-types.js';
import { toCanonical, fromCanonical } from './legacy-wow.js';

describe('Legacy WoW Adapter', () => {
    it('should roundtrip snapshots correctly', () => {
        const original: Snapshot[] = [
            { timestamp: 100, items: new Map([[1, { price: 42, quantity: 1 }]]) },
            { timestamp: 200, items: new Map([[1, { price: 0, quantity: 1 }]]) }, // Zero case
            { timestamp: 300, items: new Map() } // Empty case
        ];

        const canonical = toCanonical(original);

        expect(canonical.length).toBe(3);
        expect(canonical[0].streams['val']).toBe(42);
        expect(canonical[1].streams['val']).toBe(0);
        expect(canonical[2].streams['val']).toBe(0); // v1.2 defaults empty to 0

        const reconstructed = fromCanonical(canonical);

        expect(reconstructed.length).toBe(3);
        expect(reconstructed[0].timestamp).toBe(100);
        expect(reconstructed[0].items.get(1)?.price).toBe(42);

        // Quantity is always 1 in reconstruction (legacy decoder behavior)
        expect(reconstructed[0].items.get(1)?.quantity).toBe(1);
    });
});
