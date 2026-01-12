/**
 * GICS v1.1 Frozen API - Immutable Snapshot
 * Created: 2026-01-12
 */
// Internal Dependencies (NOT Exported)
import { HybridReader, HybridWriter } from './gics-hybrid.js';
/**
 * Frozen v1.1 Encoder
 * Wraps HybridWriter to provide a simple functional API.
 */
export async function gics11_encode(snapshots, config) {
    const writer = new HybridWriter(config);
    for (const sort of snapshots)
        await writer.addSnapshot(sort);
    return await writer.finish();
}
/**
 * Frozen v1.1 Decoder
 * Wraps HybridReader to provide a simple functional API.
 */
export async function gics11_decode(data) {
    const reader = new HybridReader(data);
    return await reader.getAllSnapshots();
}
