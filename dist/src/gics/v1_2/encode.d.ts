import { GicsFrame } from '../../gics-canonical.js';
export declare class GICSv2Engine {
    private frames;
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
    addFrame(frame: GicsFrame): Promise<void>;
    getTelemetry(): any;
    /**
     * FLUSH: Process buffered frames, emit bytes, maintain state.
     */
    flush(): Promise<Uint8Array>;
    /**
     * FINALIZE: Seal the stream, write Manifest/Sidecar.
     */
    finalize(): Promise<void>;
    finish(): Promise<Uint8Array>;
    private createBlock;
    private computeTimeDeltas;
    private computeValueDeltas;
}
