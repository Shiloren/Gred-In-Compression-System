/**
 * Type declarations for zstd-codec
 * @see https://www.npmjs.com/package/zstd-codec
 */
declare module 'zstd-codec' {
    export interface ZstdSimple {
        compress(data: Uint8Array, level?: number): Uint8Array | null;
        decompress(data: Uint8Array): Uint8Array | null;
    }

    export interface ZstdStreaming {
        // Streaming API (not used in GICS)
    }

    export interface ZstdModule {
        Simple: new () => ZstdSimple;
        Streaming: new () => ZstdStreaming;
    }

    export const ZstdCodec: {
        run(callback: (zstd: ZstdModule) => void): void;
    };
}
