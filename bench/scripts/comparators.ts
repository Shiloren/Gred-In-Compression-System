
import { ZstdCodec } from 'zstd-codec';

export interface Comparator {
    name: string;
    compress(data: Buffer): Promise<Buffer>;
    decompress(data: Buffer): Promise<Buffer>;
}

export class ZstdComparator implements Comparator {
    name = 'BASELINE_ZSTD';
    private zstd: any;

    async init() {
        return new Promise<void>((resolve) => {
            ZstdCodec.run((zstd: any) => {
                this.zstd = new zstd.Simple();
                resolve();
            });
        });
    }

    async compress(data: Buffer): Promise<Buffer> {
        if (!this.zstd) await this.init();
        // ZstdCodec Simple expects Uint8Array
        return Buffer.from(this.zstd.compress(data));
    }

    async decompress(data: Buffer): Promise<Buffer> {
        if (!this.zstd) await this.init();
        return Buffer.from(this.zstd.decompress(data));
    }
}

// Fallback or lightweight Gzip if needed, but strict requirements said "Comparator: ZSTD".
// I will rely on ZSTD since it's in package.json.
