import * as fs from 'fs/promises';
import { createWriteStream, WriteStream, existsSync } from 'fs';
import * as path from 'path';

export enum Operation {
    PUT = 0x01,
    DELETE = 0x02
}

export type WALPayload = Record<string, number | string>;

export type WALType = 'binary' | 'jsonl';
export type WALFsyncMode = 'strict' | 'best_effort';

export interface WALProviderOptions {
    fsyncMode?: WALFsyncMode;
}

export interface WALProvider {
    append(op: Operation, key: string, payload: WALPayload): Promise<void>;
    replay(handler: (op: Operation, key: string, payload: WALPayload) => void): Promise<void>;
    truncate(): Promise<void>;
    close(): Promise<void>;
}

/**
 * Standard CRC32 implementation (table-based)
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c;
}

function crc32(buffer: Buffer): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function isIgnorableFsyncError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const maybeErrno = error as NodeJS.ErrnoException;
    return maybeErrno.code === 'EPERM' || maybeErrno.code === 'EINVAL' || maybeErrno.code === 'ENOTSUP';
}

/**
 * Binary implementation of WAL for high performance and integrity.
 */
export class BinaryWALProvider implements WALProvider {
    private filePath: string;
    private writeStream: WriteStream | null = null;
    private readonly fsyncMode: WALFsyncMode;

    constructor(filePath: string, options: WALProviderOptions = {}) {
        this.filePath = filePath;
        this.fsyncMode = options.fsyncMode ?? 'best_effort';
    }

    private async ensureOpen(): Promise<void> {
        if (!this.writeStream) {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            this.writeStream = createWriteStream(this.filePath, { flags: 'a' });
        }
    }

    private async fsyncFile(): Promise<void> {
        const handle = await fs.open(this.filePath, 'r');
        try {
            await handle.sync();
        } catch (error) {
            if (this.fsyncMode === 'strict' || !isIgnorableFsyncError(error)) {
                throw error;
            }
            console.warn('[WAL] fsync not supported/allowed on this filesystem. Continuing without durable sync.');
        } finally {
            await handle.close();
        }
    }

    async append(op: Operation, key: string, payload: WALPayload): Promise<void> {
        await this.ensureOpen();

        const keyBuf = Buffer.from(key, 'utf8');
        const valBuf = Buffer.from(JSON.stringify(payload), 'utf8');

        // Header + data
        // [op: 1][keyLen: 2][key: keyLen][valLen: 4][val: valLen]
        const entryLen = 1 + 2 + keyBuf.length + 4 + valBuf.length;
        const buffer = Buffer.alloc(entryLen);

        let offset = 0;
        buffer.writeUInt8(op, offset++);
        buffer.writeUInt16LE(keyBuf.length, offset);
        offset += 2;
        keyBuf.copy(buffer, offset);
        offset += keyBuf.length;
        buffer.writeUInt32LE(valBuf.length, offset);
        offset += 4;
        valBuf.copy(buffer, offset);

        // Calculate CRC32 for the whole entry
        const crc = crc32(buffer);
        const finalBuf = Buffer.alloc(entryLen + 4);
        buffer.copy(finalBuf);
        finalBuf.writeUInt32LE(crc, entryLen);

        return new Promise<void>((resolve, reject) => {
            this.writeStream!.write(finalBuf, (err) => {
                if (err) reject(err);
                else resolve();
            });
        }).then(() => this.fsyncFile());
    }

    async replay(handler: (op: Operation, key: string, payload: WALPayload) => void): Promise<void> {
        if (!existsSync(this.filePath)) return;

        const buffer = await fs.readFile(this.filePath);
        let offset = 0;

        while (offset < buffer.length) {
            const startOffset = offset;

            if (offset + 1 + 2 > buffer.length) break; // Partial header

            const op = buffer.readUInt8(offset++);
            const keyLen = buffer.readUInt16LE(offset);
            offset += 2;

            if (offset + keyLen + 4 > buffer.length) break; // Partial key/valLen

            const key = buffer.toString('utf8', offset, offset + keyLen);
            offset += keyLen;

            const valLen = buffer.readUInt32LE(offset);
            offset += 4;

            if (offset + valLen + 4 > buffer.length) break; // Partial val/CRC

            const payloadRaw = buffer.toString('utf8', offset, offset + valLen);
            offset += valLen;

            const storedCrc = buffer.readUInt32LE(offset);
            offset += 4;

            // Verify CRC
            const entryBuffer = buffer.subarray(startOffset, offset - 4);
            if (crc32(entryBuffer) !== storedCrc) {
                console.warn(`[WAL] CRC mismatch at offset ${startOffset}. Skipping corrupted entry.`);
                continue;
            }

            try {
                const payload = JSON.parse(payloadRaw);
                handler(op as Operation, key, payload);
            } catch (e) {
                console.error(`[WAL] Failed to parse payload at offset ${startOffset}:`, e);
            }
        }
    }

    async truncate(): Promise<void> {
        if (this.writeStream) {
            this.writeStream.close();
            this.writeStream = null;
        }
        await fs.writeFile(this.filePath, ''); // Clear file
    }

    async close(): Promise<void> {
        if (this.writeStream) {
            return new Promise((resolve, reject) => {
                this.writeStream!.end((err?: Error | null) => {
                    if (err) reject(err);
                    else {
                        this.writeStream = null;
                        resolve();
                    }
                });
            });
        }
    }
}

/**
 * JSON Lines implementation of WAL.
 * One line per operation, with CRC32 to keep parity with binary provider guarantees.
 */
export class JsonlWALProvider implements WALProvider {
    private readonly filePath: string;
    private writeStream: WriteStream | null = null;
    private readonly fsyncMode: WALFsyncMode;

    constructor(filePath: string, options: WALProviderOptions = {}) {
        this.filePath = filePath;
        this.fsyncMode = options.fsyncMode ?? 'best_effort';
    }

    private async ensureOpen(): Promise<void> {
        if (!this.writeStream) {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            this.writeStream = createWriteStream(this.filePath, { flags: 'a' });
        }
    }

    private async fsyncFile(): Promise<void> {
        const handle = await fs.open(this.filePath, 'r');
        try {
            await handle.sync();
        } catch (error) {
            if (this.fsyncMode === 'strict' || !isIgnorableFsyncError(error)) {
                throw error;
            }
            console.warn('[WAL] fsync not supported/allowed on this filesystem. Continuing without durable sync.');
        } finally {
            await handle.close();
        }
    }

    async append(op: Operation, key: string, payload: WALPayload): Promise<void> {
        await this.ensureOpen();

        const base = { op, key, payload };
        const encoded = Buffer.from(JSON.stringify(base), 'utf8');
        const line = JSON.stringify({ ...base, crc32: crc32(encoded) }) + '\n';

        await new Promise<void>((resolve, reject) => {
            this.writeStream!.write(line, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await this.fsyncFile();
    }

    async replay(handler: (op: Operation, key: string, payload: WALPayload) => void): Promise<void> {
        if (!existsSync(this.filePath)) return;

        const content = await fs.readFile(this.filePath, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const parsed = JSON.parse(line) as { op: Operation; key: string; payload: WALPayload; crc32: number; };
                const payloadBuffer = Buffer.from(JSON.stringify({ op: parsed.op, key: parsed.key, payload: parsed.payload }), 'utf8');
                const computed = crc32(payloadBuffer);

                if (computed !== parsed.crc32) {
                    console.warn('[WAL] JSONL CRC mismatch. Skipping corrupted entry.');
                    continue;
                }

                handler(parsed.op, parsed.key, parsed.payload);
            } catch (error) {
                console.warn('[WAL] Invalid JSONL entry. Skipping.', error);
            }
        }
    }

    async truncate(): Promise<void> {
        if (this.writeStream) {
            this.writeStream.close();
            this.writeStream = null;
        }
        await fs.writeFile(this.filePath, '');
    }

    async close(): Promise<void> {
        if (!this.writeStream) return;
        await new Promise<void>((resolve, reject) => {
            this.writeStream!.end((err?: Error | null) => {
                if (err) reject(err);
                else {
                    this.writeStream = null;
                    resolve();
                }
            });
        });
    }
}

export function createWALProvider(type: WALType, filePath: string, options: WALProviderOptions = {}): WALProvider {
    if (type === 'jsonl') {
        return new JsonlWALProvider(filePath, options);
    }
    return new BinaryWALProvider(filePath, options);
}
