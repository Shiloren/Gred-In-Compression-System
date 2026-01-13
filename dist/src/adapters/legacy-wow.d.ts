import { Snapshot } from '../gics-types.js';
import { GicsFrame, EntityId, StreamName } from '../gics-canonical.js';
/**
 * Adapter for "Legacy WoW" format (GICS v1.0 - v1.2 pre-refactor).
 *
 * MAPPING RULES:
 * - EntityId: Hardcoded "1" (matches v1.2 behavior which takes first item or implicit single item).
 * - Streams:
 *   - "primary": Maps to Snapshot.items[first].price
 *   - "aux": Maps to Snapshot.items[first].quantity (if we tracked it, but v1.2 ignores it).
 *
 * Note: v1.2 implementation was single-stream (Time + Value).
 */
export declare const LEGACY_ENTITY_ID: EntityId;
export declare const LEGACY_STREAM_VAL: StreamName;
export declare function toCanonical(stats: Snapshot[]): GicsFrame[];
export declare function fromCanonical(frames: GicsFrame[]): Snapshot[];
