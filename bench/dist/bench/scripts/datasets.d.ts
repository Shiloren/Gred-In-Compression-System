export interface Dataset {
    name: string;
    seed: number;
    rows: number;
    data: any[];
    checksum: string;
    size_bytes: number;
}
export declare function generateTrendInt(rows: number, seed: number, nameOverride?: string): Dataset;
export declare function generateTrendIntLarge(seed: number): Dataset;
export declare function generateVolatileInt(rows: number, seed: number): Dataset;
