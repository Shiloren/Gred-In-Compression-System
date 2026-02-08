import { StreamId, OuterCodecId, InnerCodecId } from './format.js';

export interface BlockManifestEntry {
    innerCodecId: InnerCodecId;
    nItems: number;
    payloadLen: number;
    flags: number;
}

export class StreamSection {
    constructor(
        public readonly streamId: StreamId,
        public readonly outerCodecId: OuterCodecId,
        public readonly blockCount: number,
        public readonly uncompressedLen: number,
        public readonly compressedLen: number,
        public readonly sectionHash: Uint8Array,
        public readonly manifest: BlockManifestEntry[],
        public readonly payload: Uint8Array
    ) { }

    static serializeManifest(manifest: BlockManifestEntry[]): Uint8Array {
        const buffer = new Uint8Array(manifest.length * 10);
        const view = new DataView(buffer.buffer);
        let offset = 0;
        for (const entry of manifest) {
            view.setUint8(offset++, entry.innerCodecId);
            view.setUint32(offset, entry.nItems, true); offset += 4;
            view.setUint32(offset, entry.payloadLen, true); offset += 4;
            view.setUint8(offset++, entry.flags);
        }
        return buffer;
    }

    /**
     * Serializes the StreamSection to bytes.
     */
    serialize(): Uint8Array {
        const manifestSize = this.manifest.length * 10;
        const totalSize = 1 + 1 + 2 + 4 + 4 + 32 + manifestSize + this.payload.length;
        const buffer = new Uint8Array(totalSize);
        const view = new DataView(buffer.buffer);

        let pos = 0;
        view.setUint8(pos++, this.streamId);
        view.setUint8(pos++, this.outerCodecId);
        view.setUint16(pos, this.blockCount, true); pos += 2;
        view.setUint32(pos, this.uncompressedLen, true); pos += 4;
        view.setUint32(pos, this.compressedLen, true); pos += 4;
        buffer.set(this.sectionHash, pos); pos += 32;

        for (const entry of this.manifest) {
            view.setUint8(pos++, entry.innerCodecId);
            view.setUint32(pos, entry.nItems, true); pos += 4;
            view.setUint32(pos, entry.payloadLen, true); pos += 4;
            view.setUint8(pos++, entry.flags);
        }

        buffer.set(this.payload, pos);
        return buffer;
    }

    static deserialize(data: Uint8Array, offset: number): StreamSection {
        const view = new DataView(data.buffer, data.byteOffset + offset);
        let pos = 0;

        const streamId = view.getUint8(pos++);
        const outerCodecId = view.getUint8(pos++);
        const blockCount = view.getUint16(pos, true); pos += 2;
        const uncompressedLen = view.getUint32(pos, true); pos += 4;
        const compressedLen = view.getUint32(pos, true); pos += 4;
        const sectionHash = data.slice(offset + pos, offset + pos + 32); pos += 32;

        const manifest: BlockManifestEntry[] = [];
        for (let i = 0; i < blockCount; i++) {
            manifest.push({
                innerCodecId: view.getUint8(pos++),
                nItems: view.getUint32(pos, true),
                payloadLen: view.getUint32(pos + 4, true), // Corrected offset for payloadLen
                flags: view.getUint8(pos + 8) // Corrected offset for flags
            });
            pos += 4 + 4 + 1; // nItems (4 bytes) + payloadLen (4 bytes) + flags (1 byte)
        }

        const payload = data.slice(offset + pos, offset + pos + compressedLen);

        const section = new StreamSection(
            streamId,
            outerCodecId,
            blockCount,
            uncompressedLen,
            compressedLen,
            sectionHash,
            manifest,
            payload
        );
        (section as any)._totalSize = pos + compressedLen;
        return section;
    }

    get totalSize(): number {
        return (this as any)._totalSize ?? (1 + 1 + 2 + 4 + 4 + 32 + this.manifest.length * 10 + this.payload.length);
    }
}
