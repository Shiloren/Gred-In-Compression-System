import { GicsFrame } from '../../gics-canonical.js';
export declare class GICSv2Decoder {
    private data;
    private pos;
    private context;
    private static sharedContext;
    static resetSharedContext(): void;
    constructor(data: Uint8Array);
    getAllFrames(): Promise<GicsFrame[]>;
    private decodeTimeStream;
    private decodeValueStream;
    private getUint8;
    private getUint32;
}
