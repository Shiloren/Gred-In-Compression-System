export class SeededRNG {
    state;
    constructor(seed) {
        this.state = seed % 2147483647;
        if (this.state <= 0)
            this.state += 2147483646;
    }
    /**
     * Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).
     */
    next() {
        this.state = (this.state * 16807) % 2147483647;
        return (this.state - 1) / 2147483646;
    }
    /**
     * Returns a pseudo-random integer in range [min, max).
     */
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min)) + min;
    }
}
