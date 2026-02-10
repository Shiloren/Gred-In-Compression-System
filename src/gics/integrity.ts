import { createHash } from 'node:crypto';
import { crc32 as nodeCrc32 } from 'node:zlib';

/**
 * Utility for hash chain generation and verification.
 */
export class IntegrityChain {
    private currentHash: Uint8Array;

    constructor(seed?: Uint8Array) {
        if (seed) {
            this.currentHash = seed;
        } else {
            // Genesis hash if no seed provided
            this.currentHash = new Uint8Array(32).fill(0);
        }
    }

    /**
     * Updates the chain with new data and returns the next hash.
     */
    update(data: Uint8Array): Uint8Array {
        const hasher = createHash('sha256');
        hasher.update(this.currentHash);
        hasher.update(data);
        this.currentHash = new Uint8Array(hasher.digest());
        return this.currentHash;
    }

    /**
     * Returns the current root hash of the chain.
     */
    getRootHash(): Uint8Array {
        return new Uint8Array(this.currentHash);
    }
}

export function calculateCRC32(data: Uint8Array): number {
    return nodeCrc32(data);
}
