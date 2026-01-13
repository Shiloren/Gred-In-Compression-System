import { Snapshot } from '../../gics-types.js';
export declare class GICSv2Decoder {
    private data;
    private pos;
    private context;
    private static sharedContext;
    static resetSharedContext(): void;
    constructor(data: Uint8Array);
    getAllSnapshots(): Promise<Snapshot[]>;
    private decodeTimeStream;
    private decodeValueStream;
    private getUint8;
    private getUint32;
}
