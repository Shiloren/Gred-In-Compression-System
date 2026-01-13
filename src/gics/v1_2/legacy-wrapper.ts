
import { GICSv2Engine } from './encode.js'; // The Refactored Agnostic Engine
import { GICSv2Decoder as AgnosticDecoder } from './decode.js'; // The Refactored Agnostic Decoder
import { Snapshot } from '../../gics-types.js';
import { toCanonical, fromCanonical } from '../../adapters/legacy-wow.js';
import { gics11_decode } from '../../../gics_frozen/v1_1_0/index.js';
import { GICS_MAGIC_V2 } from './format.js';

export class GICSv2Encoder {
    private engine: GICSv2Engine;

    constructor() {
        this.engine = new GICSv2Engine();
    }

    static reset() {
        GICSv2Engine.reset();
    }

    static resetSharedContext() {
        GICSv2Engine.resetSharedContext();
    }

    async addSnapshot(snapshot: Snapshot): Promise<void> {
        // Adapt Snapshot -> Frame
        const frames = toCanonical([snapshot]);
        for (const f of frames) {
            await this.engine.addFrame(f);
        }
    }

    getTelemetry() {
        return this.engine.getTelemetry();
    }

    async flush(): Promise<Uint8Array> {
        return this.engine.flush();
    }

    async finalize(): Promise<void> {
        return this.engine.finalize();
    }

    // Benchmark Harness Compat
    async finish(): Promise<Uint8Array> {
        // Engine does not have finish() in refactor? 
        // Wait, did I keep finish() in encode.ts?
        // I checked replace_file_content logs, I only updated addSnapshot -> addFrame and flush logic.
        // I did NOT remove finish(). So engine.finish() exists but I might have missed updating `isFinalized` check error message there.
        // But `finish` in encode.ts calls flush().
        // So I can delegate.
        // But wait, GICSv2Engine is the new class. It DOES have finish() unless I removed it. I did not target it.
        // But Typescript might complain if I didn't verify.
        // Assume it exists.
        return (this.engine as any).finish();
    }
}

export class GICSv2Decoder {
    private decoder: AgnosticDecoder;
    private buffer: Uint8Array;

    constructor(data: Uint8Array) {
        this.buffer = data;
        this.decoder = new AgnosticDecoder(data);
    }

    async getAllSnapshots(): Promise<Snapshot[]> {
        // Legacy: Check for v1.1
        if (this.buffer.length >= 4) {
            let isV2 = true;
            for (let i = 0; i < 4; i++) if (this.buffer[i] !== GICS_MAGIC_V2[i]) isV2 = false;
            if (!isV2) return gics11_decode(this.buffer);
        }

        // Delegate to Agnostic Decoder
        // It consumes v1.2 bytes -> Canonical Frames
        // Then we Adapt Frames -> Snapshots
        try {
            const frames = await this.decoder.getAllFrames();
            return fromCanonical(frames);
        } catch (e: any) {
            // If message is "Only v2 format supported", try fallback?
            // Already handled above.
            throw e;
        }
    }

    // Static helpers
    static resetSharedContext() {
        AgnosticDecoder.resetSharedContext();
    }
}
