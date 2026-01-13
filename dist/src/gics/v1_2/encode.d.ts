import { Snapshot } from '../../gics-types.js';
export declare class GICSv2Encoder {
    private snapshots;
    private context;
    private chm;
    private mode;
    private lastTelemetry;
    private isFinalized;
    private hasEmittedHeader;
    private runId;
    private static sharedContext;
    private static sharedCHM;
    static reset(): void;
    static resetSharedContext(): void;
    constructor();
    addSnapshot(snapshot: Snapshot): Promise<void>;
    getTelemetry(): any;
    /**
     * FLUSH: Process buffered snapshots, emit bytes, maintain state.
     */
    flush(): Promise<Uint8Array>;
    /**
     * FINALIZE: Seal the stream, optionally write Manifest/Sidecar.
     */
    finalize(): Promise<void>;
    finish(): Promise<Uint8Array>;
    private createBlock;
    private computeTimeDeltas;
    private computeValueDeltas;
}
