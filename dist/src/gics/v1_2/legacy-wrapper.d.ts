import { Snapshot } from '../../gics-types.js';
export declare class GICSv2Encoder {
    private engine;
    constructor();
    static reset(): void;
    static resetSharedContext(): void;
    addSnapshot(snapshot: Snapshot): Promise<void>;
    getTelemetry(): any;
    flush(): Promise<Uint8Array>;
    finalize(): Promise<void>;
    finish(): Promise<Uint8Array>;
}
export declare class GICSv2Decoder {
    private decoder;
    private buffer;
    constructor(data: Uint8Array);
    getAllSnapshots(): Promise<Snapshot[]>;
    static resetSharedContext(): void;
}
