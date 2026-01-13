export interface ContextStore {
    version: number;
    id: string | null;
    schemaHash: string;
    dictionaries?: Record<string, Uint8Array>;
    stats?: Record<string, number>;
    lastTimestamp?: number;
    lastTimestampDelta?: number;
    lastValue?: number;
    lastValueDelta?: number;
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
    lastValueDelta?: number;
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
    /**
     * "Previous Core" accessors to satisfy architectural constraints.
     * These map to the persistent `last*` fields which are now STRICTLY for Start-of-Block reference.
     * Core blocks update them. Quarantine blocks must revert changes to them.
     */
    get prevCoreTime(): number | undefined;
    set prevCoreTime(v: number | undefined);
    get prevCoreValue(): number | undefined;
    set prevCoreValue(v: number | undefined);
    /**
     * SNAPSHOT & RESTORE
     * Used to enforce "Quarantine must not update context".
     * Encoder calls snapshot() before processing a block.
     * If block is routed to QUARANTINE, encoder calls restore().
     */
    snapshot(): ContextSnapshot;
    restore(s: ContextSnapshot): void;
}
export interface ContextSnapshot {
    lastTimestamp?: number;
    lastTimestampDelta?: number;
    lastValue?: number;
    lastValueDelta?: number;
    dictionary: number[];
    dictMap: Map<number, number>;
    dictPos: number;
    dictionaryLen: number;
}
