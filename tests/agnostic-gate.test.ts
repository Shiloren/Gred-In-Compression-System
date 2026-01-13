import { test } from 'node:test';
import assert from 'node:assert';
import { GICSv2Engine, GICSv2AgnosticDecoder, GicsFrame } from '../src/index.js';

// Phase 4: Cross-Domain Verification (Finance & Medical)

test('Agnostic Gate: Finance Data (Ticker/Close/Vol)', async (t) => {
    // 1. Ingest: Finance Data
    // Entity: "AAPL"
    // Streams: "close" (mapped to 'val')

    // Engine setup
    const engine = new GICSv2Engine();

    // Dataset: 5 ticks of AAPL
    const tickers = [150.00, 150.50, 151.00, 150.80, 152.00];
    const timestamps = [1000, 1001, 1002, 1003, 1004];

    for (let i = 0; i < tickers.length; i++) {
        // Quantize float to int (cents)
        const priceCents = Math.round(tickers[i] * 100);

        const frame: GicsFrame = {
            entityId: "AAPL",
            timestamp: timestamps[i],
            streams: {
                'val': priceCents // "val" is the primary value stream expected by v1.2 engine
            }
        };
        await engine.addFrame(frame);
    }

    const bytes = await engine.flush();
    assert.ok(bytes.length > 0, "Should produce bytes");

    // 2. Decode
    const decoder = new GICSv2AgnosticDecoder(bytes);
    const resultFrames = await decoder.getAllFrames();

    assert.strictEqual(resultFrames.length, 5);
    assert.strictEqual(resultFrames[0].timestamp, 1000);
    assert.strictEqual(resultFrames[0].streams['val'], 15000); // 150.00 * 100
    assert.strictEqual(resultFrames[4].streams['val'], 15200);
});

test('Agnostic Gate: Medical Data (Patient/HeartRate)', async (t) => {
    // 1. Ingest: Medical Data
    // Entity: "PATIENT_X"
    // Value: BPM

    const engine = new GICSv2Engine();
    const bpm = [60, 62, 65, 70, 72, 68, 60];

    for (let i = 0; i < bpm.length; i++) {
        await engine.addFrame({
            entityId: "PATIENT_X",
            timestamp: i * 1000,
            streams: { 'val': bpm[i] }
        });
    }

    const bytes = await engine.flush();
    const decoder = new GICSv2AgnosticDecoder(bytes);
    const resultFrames = await decoder.getAllFrames();

    assert.strictEqual(resultFrames.length, 7);
    assert.strictEqual(resultFrames[3].streams['val'], 70);
});
