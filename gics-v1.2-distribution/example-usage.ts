/**
 * GICS v1.2 - Example Usage
 * 
 * This file demonstrates the core functionality of GICS v1.2
 * in a simple, self-contained example.
 */

import { GICSv2Encoder, GICSv2Decoder, gics_encode, gics_decode } from './dist/src/index.js';
import type { Snapshot } from './dist/src/gics-types.js';

// ============================================================================
// Example 1: Basic Encode/Decode Workflow
// ============================================================================

async function example1_basicWorkflow() {
    console.log('\n📦 Example 1: Basic Encode/Decode Workflow\n');

    // 1. Create encoder
    const encoder = new GICSv2Encoder();

    // 2. Add snapshots (simulate market data)
    const snapshots: Snapshot[] = [
        { itemId: 1001, price: 125.50, quantity: 42, timestamp: Date.now() },
        { itemId: 1001, price: 126.00, quantity: 38, timestamp: Date.now() + 1000 },
        { itemId: 1001, price: 125.75, quantity: 45, timestamp: Date.now() + 2000 },
        { itemId: 1002, price: 200.00, quantity: 10, timestamp: Date.now() + 3000 },
    ];

    for (const snapshot of snapshots) {
        await encoder.addSnapshot(snapshot);
    }

    // 3. Flush and finalize
    const compressed = await encoder.flush();
    await encoder.finalize();

    console.log(`✅ Encoded ${snapshots.length} snapshots`);
    console.log(`📊 Compressed size: ${compressed.length} bytes`);
    console.log(`📊 Original size (approx): ${JSON.stringify(snapshots).length} bytes`);

    // 4. Decode
    const decoder = new GICSv2Decoder(compressed);
    const decoded = await decoder.getAllSnapshots();

    console.log(`✅ Decoded ${decoded.length} snapshots`);

    // 5. Verify roundtrip
    const isIdentical = JSON.stringify(snapshots) === JSON.stringify(decoded);
    console.log(`🔍 Roundtrip verification: ${isIdentical ? '✅ PASS' : '❌ FAIL'}`);

    if (!isIdentical) {
        throw new Error('Roundtrip verification failed!');
    }
}

// ============================================================================
// Example 2: Using Convenience API
// ============================================================================

async function example2_convenienceAPI() {
    console.log('\n📦 Example 2: Convenience API (gics_encode/gics_decode)\n');

    const snapshots: Snapshot[] = [
        { itemId: 5001, price: 50.25, quantity: 100, timestamp: Date.now() },
        { itemId: 5001, price: 50.50, quantity: 95, timestamp: Date.now() + 1000 },
        { itemId: 5001, price: 50.30, quantity: 98, timestamp: Date.now() + 2000 },
    ];

    // One-liner encode
    const compressed = await gics_encode(snapshots);
    console.log(`✅ Compressed: ${compressed.length} bytes`);

    // One-liner decode
    const decoded = await gics_decode(compressed);
    console.log(`✅ Decoded: ${decoded.length} snapshots`);

    // Verify
    const match = JSON.stringify(snapshots) === JSON.stringify(decoded);
    console.log(`🔍 Roundtrip: ${match ? '✅ PASS' : '❌ FAIL'}`);
}

// ============================================================================
// Example 3: Accessing Telemetry
// ============================================================================

async function example3_telemetry() {
    console.log('\n📦 Example 3: Compression Telemetry\n');

    const encoder = new GICSv2Encoder();

    // Generate trending data (should compress well)
    const trendingData: Snapshot[] = [];
    const baseTime = Date.now();
    for (let i = 0; i < 100; i++) {
        trendingData.push({
            itemId: 7001,
            price: 100 + i * 0.1, // Linear trend
            quantity: 50 + Math.floor(i / 10), // Slow growth
            timestamp: baseTime + i * 1000
        });
    }

    for (const snapshot of trendingData) {
        await encoder.addSnapshot(snapshot);
    }

    const compressed = await encoder.flush();
    await encoder.finalize();

    // Access telemetry
    const telemetry = encoder.getTelemetry();

    console.log('📊 Compression Telemetry:');
    console.log(`   Total Input: ${telemetry.core_input_bytes + telemetry.quarantine_input_bytes} bytes`);
    console.log(`   Total Output: ${telemetry.total_output_bytes} bytes`);
    console.log(`   Core Ratio: ${telemetry.core_ratio.toFixed(2)}x`);
    console.log(`   Quarantine Rate: ${(telemetry.quarantine_rate * 100).toFixed(1)}%`);
    console.log(`   Global Ratio: ${telemetry.global_ratio.toFixed(2)}x`);

    // Verify decode
    const decoder = new GICSv2Decoder(compressed);
    const decoded = await decoder.getAllSnapshots();

    const match = JSON.stringify(trendingData) === JSON.stringify(decoded);
    console.log(`\n🔍 Roundtrip: ${match ? '✅ PASS' : '❌ FAIL'}`);
}

// ============================================================================
// Example 4: Multi-Item Snapshots
// ============================================================================

async function example4_multiItem() {
    console.log('\n📦 Example 4: Multi-Item Market Snapshots\n');

    const encoder = new GICSv2Encoder();

    // Simulate market snapshots with multiple items
    const baseTime = Date.now();
    const items = [1001, 1002, 1003, 1004]; // 4 different items

    const snapshots: Snapshot[] = [];
    for (let tick = 0; tick < 20; tick++) {
        for (const itemId of items) {
            snapshots.push({
                itemId,
                price: 100 + itemId * 0.1 + tick * 0.5,
                quantity: 50 + (tick % 10),
                timestamp: baseTime + tick * 1000
            });
        }
    }

    console.log(`📝 Total snapshots: ${snapshots.length}`);
    console.log(`📝 Unique items: ${items.length}`);
    console.log(`📝 Time ticks: 20`);

    for (const snapshot of snapshots) {
        await encoder.addSnapshot(snapshot);
    }

    const compressed = await encoder.flush();
    await encoder.finalize();

    const telemetry = encoder.getTelemetry();
    console.log(`\n✅ Compressed to ${compressed.length} bytes`);
    console.log(`📊 Compression ratio: ${telemetry.global_ratio.toFixed(2)}x`);

    // Decode and verify
    const decoder = new GICSv2Decoder(compressed);
    const decoded = await decoder.getAllSnapshots();

    const match = JSON.stringify(snapshots) === JSON.stringify(decoded);
    console.log(`🔍 Roundtrip: ${match ? '✅ PASS' : '❌ FAIL'}`);
}

// ============================================================================
// Example 5: Error Handling
// ============================================================================

async function example5_errorHandling() {
    console.log('\n📦 Example 5: Error Handling\n');

    try {
        // Try to decode invalid data
        const invalidData = new Uint8Array([0x00, 0x01, 0x02]); // Not a valid GICS file
        const decoder = new GICSv2Decoder(invalidData);
        await decoder.getAllSnapshots();

        console.log('❌ Should have thrown an error!');
    } catch (error) {
        console.log('✅ Correctly caught error for invalid data');
        console.log(`   Error: ${(error as Error).message}`);
    }

    try {
        // Try to decode truncated data
        const encoder = new GICSv2Encoder();
        await encoder.addSnapshot({ itemId: 1, price: 100, quantity: 10, timestamp: Date.now() });
        const full = await encoder.flush();
        await encoder.finalize();

        const truncated = full.slice(0, 10); // Artificially truncate
        const decoder = new GICSv2Decoder(truncated);
        await decoder.getAllSnapshots();

        console.log('❌ Should have thrown an error for truncated data!');
    } catch (error) {
        console.log('✅ Correctly caught error for truncated data');
        console.log(`   Error: ${(error as Error).message}`);
    }
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  GICS v1.2 - Usage Examples              ║');
    console.log('╚══════════════════════════════════════════╝');

    try {
        await example1_basicWorkflow();
        await example2_convenienceAPI();
        await example3_telemetry();
        await example4_multiItem();
        await example5_errorHandling();

        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║  ✅ All examples completed successfully  ║');
        console.log('╚══════════════════════════════════════════╝\n');
    } catch (error) {
        console.error('\n❌ Example failed:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples();
}

export {
    example1_basicWorkflow,
    example2_convenienceAPI,
    example3_telemetry,
    example4_multiItem,
    example5_errorHandling
};
