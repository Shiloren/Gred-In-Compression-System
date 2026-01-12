export declare class SeededRNG {
    private state;
    constructor(seed: number);
    /**
     * Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).
     */
    next(): number;
    /**
     * Returns a pseudo-random integer in range [min, max).
     */
    nextInt(min: number, max: number): number;
}
