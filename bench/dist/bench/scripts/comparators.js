import { ZstdCodec } from 'zstd-codec';
export class ZstdComparator {
    name = 'BASELINE_ZSTD';
    zstd;
    async init() {
        return new Promise((resolve) => {
            ZstdCodec.run((zstd) => {
                this.zstd = new zstd.Simple();
                resolve();
            });
        });
    }
    async compress(data) {
        if (!this.zstd)
            await this.init();
        // ZstdCodec Simple expects Uint8Array
        return Buffer.from(this.zstd.compress(data));
    }
    async decompress(data) {
        if (!this.zstd)
            await this.init();
        return Buffer.from(this.zstd.decompress(data));
    }
}
// Fallback or lightweight Gzip if needed, but strict requirements said "Comparator: ZSTD".
// I will rely on ZSTD since it's in package.json.
