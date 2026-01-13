/**
 * GICS v1.1 Frozen API - Immutable Snapshot
 * Created: 2026-01-12
 */

// Internal Dependencies (NOT Exported)
import { HybridReader, HybridWriter, type HybridConfig } from './gics-hybrid.js';
import type { Snapshot } from './gics-types.js';
export type { Snapshot };

/**
 * Frozen v1.1 Encoder
 * Wraps HybridWriter to provide a simple functional API.
 */
export async function gics11_encode(snapshots: Snapshot[], config?: HybridConfig): Promise<Uint8Array> {
    const writer = new HybridWriter(config);
    for (const sort of snapshots) await writer.addSnapshot(sort);
    return await writer.finish();
}

/**
 * Frozen v1.1 Decoder
 * Wraps HybridReader to provide a simple functional API.
 */
export async function gics11_decode(data: Uint8Array): Promise<Snapshot[]> {
    const reader = new HybridReader(data);
    return await reader.getAllSnapshots();
}
