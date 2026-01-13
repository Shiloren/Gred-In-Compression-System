export declare class Codecs {
    static encodeBitPack(values: number[]): Uint8Array;
    static decodeBitPack(data: Uint8Array, count: number): number[];
    static encodeRLE(values: number[]): Uint8Array;
    static decodeRLE(data: Uint8Array): number[];
    static encodeDict(values: number[], context: any): Uint8Array;
    static decodeDict(data: Uint8Array, context: any): number[];
}
