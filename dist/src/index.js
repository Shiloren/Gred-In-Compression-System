/**
 * GICS v1.1 - Canonical Public API
 *
 * @module gics
 * @version 1.1.0 (Active Dev)
 * @status FROZEN - Canonical implementation available via version switch
 * @see docs/GICS_V1.1_SPEC.md
 */
import { GICSv2Encoder } from './gics/v1_2/encode.js';
import { GICSv2Decoder } from './gics/v1_2/decode.js';
export { GICSv2Encoder, GICSv2Decoder };
export * from './gics/v1_2/errors.js';
export * from './gics-types.js';
export * from './gics-hybrid.js'; // Keep types but not usage?
export * from './gics-utils.js';
export * from './HeatClassifier.js';
export * from './IntegrityGuardian.js';
export * from './CryptoProvider.js';
export * from './gics-range-reader.js';
/**
 * Public Encoder Entry Point - v1.2 Canonical
 */
export async function gics_encode(snapshots, config) {
    const encoder = new GICSv2Encoder();
    for (const s of snapshots)
        await encoder.addSnapshot(s);
    const data = await encoder.flush();
    await encoder.finalize();
    return data;
}
/**
 * Public Decoder Entry Point - v1.2 Canonical
 */
export async function gics_decode(data) {
    const decoder = new GICSv2Decoder(data);
    return await decoder.getAllSnapshots();
}
