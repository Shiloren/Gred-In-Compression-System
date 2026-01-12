
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gics_encode, gics_decode } from '../src/index.js';
import * as Frozen from '../gics_frozen/v1_1_0/index.js';

describe('GICS Version Routing', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    it('Should route to frozen v1.1 when GICS_VERSION="1.1"', async () => {
        process.env.GICS_VERSION = '1.1';

        // Mobile spy on the frozen module
        const encodeSpy = vi.spyOn(Frozen, 'gics11_encode');
        const decodeSpy = vi.spyOn(Frozen, 'gics11_decode');

        const dummySnapshots = [{ timestamp: 1000, items: new Map() }];

        await gics_encode(dummySnapshots);
        expect(encodeSpy).toHaveBeenCalled();

        // For decoding, we need valid data or the spy will just record the call before it potentially fails or succeeds
        const dummyData = new Uint8Array([0, 0, 0, 0]); // Invalid but triggers call
        try {
            await gics_decode(dummyData);
        } catch (e) {
            // Expected failure on invalid data, but spy should register call
        }
        expect(decodeSpy).toHaveBeenCalled();
    });

    it('Should use active implementation (direct Writer/Reader) when GICS_VERSION is unset', async () => {
        delete process.env.GICS_VERSION;

        const encodeSpy = vi.spyOn(Frozen, 'gics11_encode');
        const decodeSpy = vi.spyOn(Frozen, 'gics11_decode');

        const dummySnapshots = [{ timestamp: 1000, items: new Map() }];
        await gics_encode(dummySnapshots);

        expect(encodeSpy).not.toHaveBeenCalled();

        const dummyData = new Uint8Array([0, 0, 0, 0]);
        try {
            await gics_decode(dummyData);
        } catch (e) { }
        expect(decodeSpy).not.toHaveBeenCalled();
    });
});
