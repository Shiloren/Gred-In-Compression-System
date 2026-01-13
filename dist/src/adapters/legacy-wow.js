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
export const LEGACY_ENTITY_ID = "1";
export const LEGACY_STREAM_VAL = "val"; // Agnostic name for 'price'
export function toCanonical(stats) {
    return stats.map(s => {
        // v1.2 Logic: Take the first item in the map, or default to 0.
        // We preserve this exact behavior for bit-exact compatibility.
        // Source: src/gics/v1_2/encode.ts L95
        let price = 0;
        if (s.items.size > 0) {
            const first = s.items.values().next().value;
            if (first)
                price = first.price;
        }
        return {
            entityId: LEGACY_ENTITY_ID,
            timestamp: s.timestamp,
            streams: {
                [LEGACY_STREAM_VAL]: price
            }
        };
    });
}
export function fromCanonical(frames) {
    return frames.map(f => {
        // Reconstruct Legacy Snapshot
        // v1.2 Decoder Logic: src/gics/v1_2/decode.ts L132
        // map.set(1, { price: val, quantity: 1 });
        const map = new Map();
        const val = f.streams[LEGACY_STREAM_VAL] || 0;
        // We use hardcoded ID 1 to match legacy decoder expectation
        map.set(1, { price: val, quantity: 1 });
        return {
            timestamp: f.timestamp,
            items: map
        };
    });
}
