/**
 * GICS v0.3 Temporal Delta Encoder
 * Compresses sequential snapshots using delta-of-delta encoding
 * Target: 50× combined with columnar compression
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { encodeVarint, decodeVarint, encodeRLE, decodeRLE } from './gics-columnar.js';

export interface TemporalSnapshot {
    timestamp: number;
    items: Map<number, { price: number; quantity: number }>;
}

/**
 * Temporal encoder that compresses multiple snapshots using delta-of-delta
 */
export class TemporalDeltaEncoder {
    private previousItems: Map<number, { price: number; quantity: number }> | null = null;
    private previousPriceDeltas: number[] = [];  // For delta-of-delta encoding
    private previousQtyDeltas: number[] = [];    // For delta-of-delta encoding
    private sortedIds: number[] = [];
    private isFirst = true;
    private isSecond = false;

    /**
     * Encode a snapshot, using delta from previous if available
     */
    encode(snapshot: TemporalSnapshot): Uint8Array {
        // Sort items by ID for consistent ordering
        const sorted = Array.from(snapshot.items.entries()).sort((a, b) => a[0] - b[0]);

        if (this.isFirst) {
            // First snapshot: encode full keyframe
            this.isFirst = false;
            this.sortedIds = sorted.map(([id]) => id);
            this.previousItems = new Map(sorted);
            return this.encodeKeyframe(sorted, snapshot.timestamp);
        }

        // Delta snapshot: encode only changes from previous
        const result = this.encodeDelta(sorted, snapshot.timestamp);
        this.previousItems = new Map(sorted);
        return result;
    }

    /**
     * Encode full keyframe (first snapshot)
     */
    private encodeKeyframe(sorted: [number, { price: number; quantity: number }][], timestamp: number): Uint8Array {
        const header = new Uint8Array(5);
        header[0] = 0x4B; // 'K' for Keyframe
        new DataView(header.buffer).setUint32(1, timestamp, true);

        // Extract columns
        const ids = sorted.map(([id]) => id);
        const prices = sorted.map(([_, v]) => Math.floor(v.price));
        const quantities = sorted.map(([_, v]) => v.quantity);

        // Delta encode IDs (sorted, so deltas are small)
        const idDeltas = [ids[0]];
        for (let i = 1; i < ids.length; i++) {
            idDeltas.push(ids[i] - ids[i - 1]);
        }

        // Encode columns
        const idsEncoded = encodeVarint(idDeltas);
        const pricesEncoded = encodeVarint(prices);
        const quantitiesEncoded = encodeVarint(quantities);

        // Combine all data into single buffer before compression
        // Format: [idsLen:2][pricesLen:2][ids][prices][quantities]
        const rawDataLen = 4 + idsEncoded.length + pricesEncoded.length + quantitiesEncoded.length;
        const rawData = new Uint8Array(rawDataLen);
        const rawView = new DataView(rawData.buffer);

        rawView.setUint16(0, idsEncoded.length, true);
        rawView.setUint16(2, pricesEncoded.length, true);
        rawData.set(idsEncoded, 4);
        rawData.set(pricesEncoded, 4 + idsEncoded.length);
        rawData.set(quantitiesEncoded, 4 + idsEncoded.length + pricesEncoded.length);

        // Single zlib compression
        const compressed = deflateSync(Buffer.from(rawData), { level: 9 });

        // Build packet: header + itemCount + compressedLen + compressed
        const packet = new Uint8Array(5 + 2 + 4 + compressed.length);
        const packetView = new DataView(packet.buffer);

        packet.set(header, 0);
        packetView.setUint16(5, sorted.length, true);
        packetView.setUint32(7, compressed.length, true);
        packet.set(compressed, 11);

        return packet;
    }

    /**
     * Encode delta snapshot (subsequent snapshots)
     */
    private encodeDelta(sorted: [number, { price: number; quantity: number }][], timestamp: number): Uint8Array {
        const header = new Uint8Array(5);
        header[0] = 0x44; // 'D' for Delta
        new DataView(header.buffer).setUint32(1, timestamp, true);

        // REVOLUTIONARY: Delta-of-delta + sparse encoding
        // Step 1: Calculate current deltas
        // Step 2: Calculate delta-of-delta (current delta - previous delta)
        // Step 3: Only store non-zero delta-of-deltas (most will be 0!)

        const itemCount = sorted.length;
        const bitmapBytes = Math.ceil(itemCount / 8);
        const bitmap = new Uint8Array(bitmapBytes);

        const currentPriceDeltas: number[] = [];
        const currentQtyDeltas: number[] = [];
        const changedPriceDoD: number[] = [];
        const changedQtyDoD: number[] = [];

        for (let i = 0; i < sorted.length; i++) {
            const [id, { price, quantity }] = sorted[i];
            const prev = this.previousItems!.get(id);

            // Calculate current delta
            const priceDelta = prev ? Math.floor(price) - Math.floor(prev.price) : Math.floor(price);
            const qtyDelta = prev ? quantity - prev.quantity : quantity;

            currentPriceDeltas.push(priceDelta);
            currentQtyDeltas.push(qtyDelta);

            // Calculate delta-of-delta (if we have previous deltas)
            const prevPriceDelta = this.previousPriceDeltas[i] || 0;
            const prevQtyDelta = this.previousQtyDeltas[i] || 0;

            const priceDoD = priceDelta - prevPriceDelta;
            const qtyDoD = qtyDelta - prevQtyDelta;

            // If either DoD is non-zero, mark in bitmap and store
            if (priceDoD !== 0 || qtyDoD !== 0) {
                bitmap[Math.floor(i / 8)] |= (1 << (i % 8));
                changedPriceDoD.push(priceDoD);
                changedQtyDoD.push(qtyDoD);
            }
        }

        // Save current deltas for next round
        this.previousPriceDeltas = currentPriceDeltas;
        this.previousQtyDeltas = currentQtyDeltas;

        // Encode only changed delta-of-deltas
        const pricesEncoded = encodeVarint(changedPriceDoD);
        const quantitiesEncoded = encodeVarint(changedQtyDoD);

        // Combine all data into single buffer before compression
        const rawDataLen = 4 + bitmap.length + pricesEncoded.length + quantitiesEncoded.length;
        const rawData = new Uint8Array(rawDataLen);
        const rawView = new DataView(rawData.buffer);
        let rawOffset = 0;

        rawView.setUint16(rawOffset, bitmap.length, true); rawOffset += 2;
        rawView.setUint16(rawOffset, pricesEncoded.length, true); rawOffset += 2;
        rawData.set(bitmap, rawOffset); rawOffset += bitmap.length;
        rawData.set(pricesEncoded, rawOffset); rawOffset += pricesEncoded.length;
        rawData.set(quantitiesEncoded, rawOffset);

        // Single zlib compression for all data
        const compressed = deflateSync(Buffer.from(rawData), { level: 9 });

        // Build packet: header + itemCount + compressedLen + compressed
        const packet = new Uint8Array(5 + 2 + 4 + compressed.length);
        const packetView = new DataView(packet.buffer);

        packet.set(header, 0);
        packetView.setUint16(5, itemCount, true);
        packetView.setUint32(7, compressed.length, true);
        packet.set(compressed, 11);

        return packet;
    }

    /**
     * Reset state for new file
     */
    reset(): void {
        this.previousItems = null;
        this.sortedIds = [];
        this.isFirst = true;
    }
}

/**
 * Temporal decoder
 */
export class TemporalDeltaDecoder {
    private previousItems: Map<number, { price: number; quantity: number }> = new Map();
    private previousPriceDeltas: number[] = [];  // For delta-of-delta decoding
    private previousQtyDeltas: number[] = [];    // For delta-of-delta decoding
    private sortedIds: number[] = [];

    /**
     * Decode a snapshot
     */
    decode(data: Uint8Array): TemporalSnapshot {
        const type = data[0];
        const view = new DataView(data.buffer, data.byteOffset);
        const timestamp = view.getUint32(1, true);

        if (type === 0x4B) {
            return this.decodeKeyframe(data, timestamp);
        } else {
            return this.decodeDelta(data, timestamp);
        }
    }

    private decodeKeyframe(data: Uint8Array, timestamp: number): TemporalSnapshot {
        const view = new DataView(data.buffer, data.byteOffset);
        let offset = 5;

        // Read header
        const itemCount = view.getUint16(offset, true); offset += 2;
        const compressedLen = view.getUint32(offset, true); offset += 4;

        // Decompress single block
        const compressed = data.slice(offset, offset + compressedLen);
        const rawData = new Uint8Array(inflateSync(compressed));
        const rawView = new DataView(rawData.buffer);

        // Read internal lengths
        const idsLen = rawView.getUint16(0, true);
        const pricesLen = rawView.getUint16(2, true);

        // Extract components
        let rawOff = 4;
        const idsEncoded = rawData.slice(rawOff, rawOff + idsLen); rawOff += idsLen;
        const pricesEncoded = rawData.slice(rawOff, rawOff + pricesLen); rawOff += pricesLen;
        const quantitiesEncoded = rawData.slice(rawOff);

        const idDeltas = decodeVarint(idsEncoded);
        const prices = decodeVarint(pricesEncoded);
        const quantities = decodeVarint(quantitiesEncoded);

        // Reconstruct IDs from deltas
        const ids = [idDeltas[0]];
        for (let i = 1; i < idDeltas.length; i++) {
            ids.push(ids[i - 1] + idDeltas[i]);
        }

        this.sortedIds = ids;
        const items = new Map<number, { price: number; quantity: number }>();

        for (let i = 0; i < ids.length; i++) {
            items.set(ids[i], { price: prices[i], quantity: quantities[i] });
        }

        this.previousItems = new Map(items);
        return { timestamp, items };
    }

    private decodeDelta(data: Uint8Array, timestamp: number): TemporalSnapshot {
        const view = new DataView(data.buffer, data.byteOffset);
        let offset = 5;

        // Read header
        const itemCount = view.getUint16(offset, true); offset += 2;
        const compressedLen = view.getUint32(offset, true); offset += 4;

        // Decompress single block
        const compressed = data.slice(offset, offset + compressedLen);
        const rawData = new Uint8Array(inflateSync(compressed));
        const rawView = new DataView(rawData.buffer);

        // Read internal lengths
        const bitmapLen = rawView.getUint16(0, true);
        const pricesLen = rawView.getUint16(2, true);

        // Extract components
        let rawOff = 4;
        const bitmap = rawData.slice(rawOff, rawOff + bitmapLen); rawOff += bitmapLen;
        const pricesEncoded = rawData.slice(rawOff, rawOff + pricesLen); rawOff += pricesLen;
        const quantitiesEncoded = rawData.slice(rawOff);

        // Decode delta-of-delta values
        const priceDoDs = decodeVarint(pricesEncoded);
        const qtyDoDs = decodeVarint(quantitiesEncoded);

        // Build items starting from previous snapshot using DoD reconstruction
        const items = new Map<number, { price: number; quantity: number }>();
        const currentPriceDeltas: number[] = [];
        const currentQtyDeltas: number[] = [];
        let dodIdx = 0;

        for (let i = 0; i < this.sortedIds.length; i++) {
            const id = this.sortedIds[i];
            const prev = this.previousItems.get(id)!;
            const prevPriceDelta = this.previousPriceDeltas[i] || 0;
            const prevQtyDelta = this.previousQtyDeltas[i] || 0;

            // Check if this item has a DoD (bit set in bitmap)
            const hasDoD = (bitmap[Math.floor(i / 8)] & (1 << (i % 8))) !== 0;

            let priceDelta: number;
            let qtyDelta: number;

            if (hasDoD) {
                // Reconstruct delta from DoD: delta = prevDelta + DoD
                priceDelta = prevPriceDelta + priceDoDs[dodIdx];
                qtyDelta = prevQtyDelta + qtyDoDs[dodIdx];
                dodIdx++;
            } else {
                // No change in delta - same as previous
                priceDelta = prevPriceDelta;
                qtyDelta = prevQtyDelta;
            }

            currentPriceDeltas.push(priceDelta);
            currentQtyDeltas.push(qtyDelta);

            // Apply delta to get new value
            items.set(id, {
                price: prev.price + priceDelta,
                quantity: prev.quantity + qtyDelta
            });
        }

        // Save deltas for next round
        this.previousPriceDeltas = currentPriceDeltas;
        this.previousQtyDeltas = currentQtyDeltas;
        this.previousItems = new Map(items);
        return { timestamp, items };
    }

    reset(): void {
        this.previousItems.clear();
        this.previousPriceDeltas = [];
        this.previousQtyDeltas = [];
        this.sortedIds = [];
    }
}
