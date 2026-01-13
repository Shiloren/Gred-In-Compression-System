#!/usr/bin/env node

/**
 * GICS v1.2 - Quick Verification Script
 * 
 * Verifies that the GICS package is correctly built and functional.
 */

import { GICSv2Encoder, GICSv2Decoder } from './dist/src/index.js';

console.log('\n╔══════════════════════════════════════════╗');
console.log('║  GICS v1.2 - Quick Verification          ║');
console.log('╚══════════════════════════════════════════╝\n');

async function verify() {
    try {
        // Test 1: Encoder instantiation
        console.log('🔧 Test 1: Instantiating encoder...');
        const encoder = new GICSv2Encoder();
        console.log('   ✅ Encoder created successfully\n');

        // Test 2: Adding snapshots
        console.log('🔧 Test 2: Adding test snapshots...');
        const testSnapshots = [
            { itemId: 1001, price: 100.5, quantity: 10, timestamp: Date.now() },
            { itemId: 1001, price: 101.2, quantity: 12, timestamp: Date.now() + 1000 },
            { itemId: 1002, price: 200.0, quantity: 5, timestamp: Date.now() + 2000 }
        ];

        for (const snapshot of testSnapshots) {
            await encoder.addSnapshot(snapshot);
        }
        console.log(`   ✅ Added ${testSnapshots.length} snapshots\n`);

        // Test 3: Compression
        console.log('🔧 Test 3: Compressing data...');
        const compressed = await encoder.flush();
        await encoder.finalize();
        console.log(`   ✅ Compressed to ${compressed.length} bytes\n`);

        // Test 4: Telemetry
        console.log('🔧 Test 4: Reading telemetry...');
        const telemetry = encoder.getTelemetry();
        console.log('   📊 Telemetry:');
        console.log(`      Core Ratio: ${telemetry.core_ratio.toFixed(2)}x`);
        console.log(`      Quarantine Rate: ${(telemetry.quarantine_rate * 100).toFixed(1)}%`);
        console.log(`      Total Output: ${telemetry.total_output_bytes} bytes`);
        console.log('   ✅ Telemetry retrieved successfully\n');

        // Test 5: Decoder instantiation
        console.log('🔧 Test 5: Instantiating decoder...');
        const decoder = new GICSv2Decoder(compressed);
        console.log('   ✅ Decoder created successfully\n');

        // Test 6: Decompression
        console.log('🔧 Test 6: Decompressing data...');
        const decoded = await decoder.getAllSnapshots();
        console.log(`   ✅ Decoded ${decoded.length} snapshots\n`);

        // Test 7: Roundtrip verification
        console.log('🔧 Test 7: Verifying roundtrip integrity...');
        const original = JSON.stringify(testSnapshots);
        const recovered = JSON.stringify(decoded);
        const isIdentical = original === recovered;

        if (isIdentical) {
            console.log('   ✅ Roundtrip verification PASSED\n');
        } else {
            console.log('   ❌ Roundtrip verification FAILED\n');
            console.log('   Original:', original);
            console.log('   Recovered:', recovered);
            throw new Error('Roundtrip mismatch!');
        }

        // Success!
        console.log('╔══════════════════════════════════════════╗');
        console.log('║  ✅ ALL TESTS PASSED                     ║');
        console.log('║  GICS v1.2 is ready for use!             ║');
        console.log('╚══════════════════════════════════════════╝\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Verification failed:', error);
        console.error('\nStack trace:', error instanceof Error ? error.stack : 'N/A');
        process.exit(1);
    }
}

verify();
