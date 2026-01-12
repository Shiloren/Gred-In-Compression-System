export interface ContextStore {
    version: number;
    id: string | null;
    schemaHash: string;
    dictionaries?: Record<string, Uint8Array>;
    stats?: Record<string, number>;
    lastTimestamp?: number;
    lastTimestampDelta?: number;
    lastValue?: number;
}
export declare class ContextV0 implements ContextStore {
    private static idCounter;
    version: number;
    id: string | null;
    schemaHash: string;
    dictionaries: Record<string, Uint8Array>;
    stats: Record<string, number>;
    lastTimestamp?: number;
    lastTimestampDelta?: number;
    lastValue?: number;
    dictionary: number[];
    dictMap: Map<number, number>;
    maxDictSize: number;
    metrics: {
        refCount: number;
        hits: number;
        misses: number;
        predictedGainBytes: number;
        netGainBytes: number;
    };
    /**
     * Reset per-block metrics. Call this before processing a new block if you want per-block stats.
     * Or keep accumulating for stream-lifetime stats.
     * Spec says "ctx_bytes_emitted_total" etc.
     */
    resetMetrics(): void;
    constructor(schemaHash: string, id?: string | null);
    serialize(): Uint8Array;
    static deserialize(data: Uint8Array): ContextV0;
    dictPos: number;
    updateDictionary(val: number): void;
    /**
     * Creates a lightweight clone of the active coding state.
     * Used for "Dry Run" probes to prevent mutation of the canonical context.
     *
     * Copies:
     * - dictionary (Array & Map)
     * - dictPos, maxDictSize
     * - lastTimestamp, lastValues (History)
     *
     * Does NOT Copy:
     * - metrics (resets to 0)
     * - dictionaries (shared ref acceptable or ignored for probe)
     * - stats (shared ref acceptable or ignored)
     */
    clone(): ContextV0;
    lookup(val: number): number | undefined;
}
