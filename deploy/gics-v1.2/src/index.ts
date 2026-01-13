/**
 * GICS v1.2 - Agnostic Compression Engine
 * 
 * @module gics
 * @version 1.2.0 (Stable)
 * @see MIGRATION_GUIDE.md
 */

import { gics11_encode, gics11_decode } from './gics_frozen/v1_1_0/index.js';
import { GICSv2Encoder } from './gics/v1_2/encode.js';
import { GICSv2Decoder } from './gics/v1_2/decode.js';
import { Snapshot } from './gics-types.js';

// Re-export Core Types
export * from './gics-types.js';
export * from './gics-utils.js';
export * from './gics/v1_2/errors.js';

// Re-export v1.2 Components
export { GICSv2Encoder, GICSv2Decoder };

// [OPTIONAL] Re-export Heat/Integrity if used by consumer
export * from './HeatClassifier.js';
export * from './IntegrityGuardian.js';
export * from './CryptoProvider.js';

/**
 * Public Encoder Entry Point
 * 
 * USAGE:
 * process.env.GICS_VERSION = '1.1' -> Uses Frozen v1.1 (Legacy)
 * process.env.GICS_VERSION = '1.2' -> Uses New v1.2 (Default)
 */
export async function gics_encode(snapshots: Snapshot[], config?: any): Promise<Uint8Array> {
    if (process.env.GICS_VERSION === '1.1') {
        return gics11_encode(snapshots, config);
    }

    // Default to v1.2
    const encoder = new GICSv2Encoder();
    for (const s of snapshots) await encoder.addSnapshot(s);
    // Note: HybridReader/Writer are deprecated/internal. v1.2 uses its own flow.
    // If config was used for HybridWriter settings, it is ignored in v1.2 as v1.2 auto-tunes.
    const data = await encoder.flush();
    await encoder.finalize();
    return data;
}

/**
 * Public Decoder Entry Point
 * 
 * Automatically detects v1.1 vs v1.2 format via Magic Bytes.
 */
export async function gics_decode(data: Uint8Array): Promise<Snapshot[]> {
    // Check for GICS v2 Magic: [0x47, 0x49, 0x43, 0x53] (GICS)
    // v1.1 might not have this magic or has different magic.
    // GICSv2Decoder handles the check internally and falls back to v1.1 if needed.

    const decoder = new GICSv2Decoder(data);
    return await decoder.getAllSnapshots();
}
