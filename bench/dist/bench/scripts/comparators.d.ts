export interface Comparator {
    name: string;
    compress(data: Buffer): Promise<Buffer>;
    decompress(data: Buffer): Promise<Buffer>;
}
export declare class ZstdComparator implements Comparator {
    name: string;
    private zstd;
    init(): Promise<void>;
    compress(data: Buffer): Promise<Buffer>;
    decompress(data: Buffer): Promise<Buffer>;
}
