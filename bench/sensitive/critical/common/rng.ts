/**
 * Deterministic RNG for Critical Suite.
 * Implementation: Mulberry32 (Fast, decent quality, 32-bit state).
 */
export class CriticalRNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed;
    }

    private nextInt32(): number {
        var t = this.state += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0);
    }

    /**
     * Returns a float between [0, 1)
     */
    next(): number {
        return this.nextInt32() / 4294967296;
    }

    /**
     * Returns integer in [min, max)
     */
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min)) + min;
    }

    /**
     * Returns a random byte (0-255)
     */
    nextByte(): number {
        return this.nextInt(0, 256);
    }

    /**
     * Fills a buffer with random bytes
     */
    fill(buffer: Uint8Array): void {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = this.nextByte();
        }
    }
}
