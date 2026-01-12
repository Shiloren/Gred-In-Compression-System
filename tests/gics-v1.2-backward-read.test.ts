import { gics_encode, gics_decode, Snapshot } from '../src/index.js';
import assert from 'assert';

async function testBackwardRead() {
    console.log('--- GICS v1.2 Backward Read Test ---');

    // 1. Encode with v1.1
    process.env.GICS_VERSION = '1.1';

    const snapshots: Snapshot[] = [];
    const baseTime = 1700000000;
    for (let i = 0; i < 5; i++) {
        const map = new Map();
        map.set(101, { price: 200 + i, quantity: 10 });
        snapshots.push({
            timestamp: baseTime + (i * 60),
            items: map
        });
    }

    console.log('Encoding with v1.1...');
    const encodedV1 = await gics_encode(snapshots);
    console.log(`v1.1 Payload Size: ${encodedV1.length}`);

    // 2. Decode with v1.2 (Router set to 1.2, or just rely on V2 Decoder)
    process.env.GICS_VERSION = '1.2';

    console.log('Decoding with v1.2 decoder...');
    // Note: gics_decode will route to GICSv2Decoder because of ENV var.
    // GICSv2Decoder should detect non-v2 magic and fallback.
    const decoded = await gics_decode(encodedV1);

    assert.strictEqual(decoded.length, snapshots.length, 'Snapshot count mismatch');

    // v1.1 snapshots usually preserve full data. Our v1.2 skeleton only did partial, 
    // BUT since we fell back to v1.1 decode, we should get FULL data back!
    // So we can check equality more strictly.

    for (let i = 0; i < snapshots.length; i++) {
        assert.strictEqual(decoded[i].timestamp, snapshots[i].timestamp);
        // Check exact match (v1.1 preserves items)
        const item = decoded[i].items.get(101);
        assert.ok(item, 'Item 101 missing');
        assert.strictEqual(item?.price, 200 + i);
    }

    console.log('✅ Backward Read Success');
}

testBackwardRead().catch(err => {
    console.error(err);
    process.exit(1);
});
