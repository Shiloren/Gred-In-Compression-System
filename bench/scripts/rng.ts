export class SeededRNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed % 2147483647;
        if (this.state <= 0) this.state += 2147483646;
    }

    /**
     * Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).
     */
    next(): number {
        this.state = (this.state * 16807) % 2147483647;
        return (this.state - 1) / 2147483646;
    }

    /**
     * Returns a pseudo-random integer in range [min, max).
     */
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min)) + min;
    }
}
