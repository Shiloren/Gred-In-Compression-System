
import { describe, it, expect } from 'vitest';
import { HybridWriter, HybridReader } from '../src/lib/gics/gics-hybrid';
import type { Snapshot } from '../src/lib/gics/gics-types';
import * as fs from 'fs';
import * as path from 'path';

describe('Real World GICS Verification (User Data)', () => {

    // Path to imported data
    const DATA_DIR = path.join(__dirname, '../data/tsm_import');
    const AUCTIONATOR_FILE = path.join(DATA_DIR, 'Auctionator.lua');

    it('should parse real Auctionator data and compress it > 100x', async () => {
        if (!fs.existsSync(AUCTIONATOR_FILE)) {
            console.warn('⚠️ Auctionator.lua not found. Skipping Real World test.');
            return;
        }

        console.log('📖 Reading Auctionator.lua...');
        const content = fs.readFileSync(AUCTIONATOR_FILE, 'utf-8');

        // 1. Parse Data
        // Look for AUCTIONATOR_PRICE_DATABASE = { ... }
        // Entries: ["12345"] = 67890,
        const priceMap = new Map<number, number>();
        // regex to match ["12345"] = 67890,
        // We scan the entire file. Even if we catch data from other tables, valid itemID->price pairs are what we want.
        const regex = /\["(\d+)"\]\s*=\s*(\d+)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            const itemId = parseInt(match[1]);
            const price = parseInt(match[2]);
            if (!isNaN(itemId) && !isNaN(price) && price > 0) {
                // Filter out obviously bad data if any
                priceMap.set(itemId, price);
            }
        }

        console.log(`✅ Loaded ${priceMap.size} unique items from real world data.`);
        expect(priceMap.size).toBeGreaterThan(0);

        // 2. Generate 30 Days of History based on this seed
        // We assume this snapshot is Day 1. We verify GICS can compress
        // a realistic evolution of this market for 30 days.
        const snapshots: Snapshot[] = [];
        const baseTimestamp = 1700000000;
        const totalHours = 30 * 24;

        // Tier classification (5% Hot, 15% Warm, 80% Cold)
        const itemKeys = Array.from(priceMap.keys());
        const tiers = new Map<number, 'hot' | 'warm' | 'cold'>();

        for (const pid of itemKeys) {
            const rand = Math.random();
            if (rand < 0.05) tiers.set(pid, 'hot');
            else if (rand < 0.20) tiers.set(pid, 'warm');
            else tiers.set(pid, 'cold');
        }

        console.log('⏳ Generating 30 days of market evolution...');

        // Optimize generation speed for large datasets
        const currentPrices = new Map<number, number>(priceMap);
        const currentQuantities = new Map<number, number>();
        // Init quantities
        for (const pid of itemKeys) currentQuantities.set(pid, Math.floor(Math.random() * 500) + 1);

        for (let hour = 0; hour < totalHours; hour++) {
            const timestamp = baseTimestamp + hour * 3600;
            const snapshotItems = new Map<number, { price: number; quantity: number }>();

            // Only simulate changes
            for (const itemId of itemKeys) {
                const tier = tiers.get(itemId)!;
                let price = currentPrices.get(itemId)!;
                let quantity = currentQuantities.get(itemId)!;
                let changed = false;

                if (tier === 'hot') {
                    // Always changes slightly
                    price += Math.floor((Math.random() - 0.5) * 5);
                    quantity += Math.floor((Math.random() - 0.5) * 2);
                    changed = true;
                } else if (tier === 'warm') {
                    // 10% chance
                    if (Math.random() < 0.1) {
                        price += Math.floor((Math.random() - 0.5) * 50);
                        quantity += Math.floor((Math.random() - 0.5) * 10);
                        changed = true;
                    }
                } else {
                    // Cold: 0.5% chance
                    if (Math.random() < 0.005) {
                        price += Math.floor((Math.random() - 0.5) * 200);
                        quantity += Math.floor((Math.random() - 0.5) * 50);
                        changed = true;
                    }
                }

                // Bounds check
                if (price < 1) price = 1;
                if (quantity < 0) quantity = 0;

                if (changed) {
                    currentPrices.set(itemId, price);
                    currentQuantities.set(itemId, quantity);
                }

                snapshotItems.set(itemId, { price, quantity });
            }

            snapshots.push({ timestamp, items: snapshotItems });
        }

        // 3. Compress using ULTRA settings
        console.log('🚀 compressing...');
        const writer = new HybridWriter({
            blockDurationDays: 30,
            compressionLevel: 22
        });

        for (const s of snapshots) await writer.addSnapshot(s);
        const compressed = await writer.finish();

        // 4. Calculate Ratio
        // Raw size estimate: (8 bytes ID + 8 bytes Price + 4 bytes Qty) * items * snapshots
        const rawBytes = itemKeys.length * 20 * snapshots.length;
        const ratio = rawBytes / compressed.length;

        console.log(`\n📊 REAL WORLD RESULTS:`);
        console.log(`Steps: ${snapshots.length} hours (30 days)`);
        console.log(`Items: ${itemKeys.length}`);
        console.log(`Raw Size (Est): ${(rawBytes / 1024 / 1024).toFixed(2)} MB`);
        console.log(`GICS Size: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Compression Ratio: ${ratio.toFixed(2)}x`);

        // 5. Verify Integrity
        console.log('🔍 Verifying integrity...');
        const reader = new HybridReader(compressed);
        const first = await reader.getSnapshotAt(baseTimestamp);
        const last = await reader.getSnapshotAt(baseTimestamp + (totalHours - 1) * 3600);

        expect(first).toBeDefined();
        expect(last).toBeDefined();

        // Random spot check
        const checkId = itemKeys[Math.floor(Math.random() * itemKeys.length)];
        const originalPrice = snapshots[0].items.get(checkId)?.price;
        const restoredPrice = first?.items.get(checkId)?.price;

        if (originalPrice !== restoredPrice) {
            console.error(`❌ Integrity Check Failed for Item ${checkId}`);
            console.error(`   Timestamp: ${baseTimestamp}`);
            console.error(`   Original: ${originalPrice}`);
            console.error(`   Restored: ${restoredPrice}`);
        }

        expect(restoredPrice).toBe(originalPrice);

        // Require 100x for success
        expect(ratio).toBeGreaterThan(100);
    }, 600000); // 10 min timeout
});
