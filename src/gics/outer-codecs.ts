import { ZstdCodec } from 'zstd-codec';
import { OuterCodecId } from './format.js';

export interface OuterCodec {
    id: OuterCodecId;
    name: string;
    compress(data: Uint8Array, level?: number): Promise<Uint8Array>;
    decompress(data: Uint8Array): Promise<Uint8Array>;
}

/**
 * Registry of available outer codecs.
 */
export const OUTER_CODECS: Map<OuterCodecId, OuterCodec> = new Map();

/**
 * Identity codec (no compression).
 */
export const OuterCodecNone: OuterCodec = {
    id: OuterCodecId.NONE,
    name: 'NONE',
    async compress(data: Uint8Array) {
        return data;
    },
    async decompress(data: Uint8Array) {
        return data;
    },
};

/**
 * Zstd codec wrapper.
 */
let zstdInstance: any = null;

async function getZstd() {
    if (zstdInstance) return zstdInstance;
    return new Promise((resolve) => {
        ZstdCodec.run((zstd) => {
            zstdInstance = zstd;
            resolve(zstd);
        });
    });
}

export const OuterCodecZstd: OuterCodec = {
    id: OuterCodecId.ZSTD,
    name: 'ZSTD',
    async compress(data: Uint8Array, level: number = 3) {
        const zstd: any = await getZstd();
        const simple = new zstd.Simple();
        const compressed = simple.compress(data, level);
        if (!compressed) throw new Error('Zstd compression failed');
        return compressed;
    },
    async decompress(data: Uint8Array) {
        const zstd: any = await getZstd();
        const simple = new zstd.Simple();
        const decompressed = simple.decompress(data);
        if (!decompressed) throw new Error('Zstd decompression failed');
        return decompressed;
    },
};

OUTER_CODECS.set(OuterCodecId.NONE, OuterCodecNone);
OUTER_CODECS.set(OuterCodecId.ZSTD, OuterCodecZstd);

export function getOuterCodec(id: OuterCodecId): OuterCodec {
    const codec = OUTER_CODECS.get(id);
    if (!codec) {
        throw new Error(`Unknown OuterCodecId: ${id}`);
    }
    return codec;
}
