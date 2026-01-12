import { encodeVarint } from '../../gics-utils.js';
import { GICS_MAGIC_V2, V12_FLAGS, StreamId, CodecId, GICS_VERSION_BYTE, BLOCK_HEADER_SIZE } from './format.js';
import { ContextV0 } from './context.js';
import { calculateBlockMetrics, classifyRegime } from './metrics.js';
import { Codecs } from './codecs.js';
import { HealthMonitor } from './chm.js';
import * as fs from 'fs';
import * as path from 'path';
const BLOCK_SIZE = 1000;
// User Requirement: Strict Safe Logic selection.
const SAFE_CODEC_TIME = CodecId.DOD_VARINT;
const SAFE_CODEC_VALUE = CodecId.VARINT_DELTA;
export class GICSv2Encoder {
    snapshots = [];
    context;
    chm;
    mode;
    lastTelemetry = null;
    isFinalized = false;
    hasEmittedHeader = false;
    runId;
    static sharedContext = null;
    static sharedCHM = null;
    static reset() {
        GICSv2Encoder.sharedContext = null;
        GICSv2Encoder.sharedCHM = null;
    }
    static resetSharedContext() {
        GICSv2Encoder.reset();
    }
    constructor() {
        if (process.env.GICS_TEST_RUN_ID) {
            this.runId = process.env.GICS_TEST_RUN_ID;
        }
        else {
            this.runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        this.mode = process.env.GICS_CONTEXT_MODE || 'on';
        if (this.mode === 'off') {
            this.context = new ContextV0('hash_placeholder', null);
            const envProbe = process.env.GICS_PROBE_INTERVAL;
            const probeInterval = (envProbe !== undefined && envProbe !== '') ? parseInt(envProbe, 10) : 4;
            this.chm = new HealthMonitor(this.runId, probeInterval);
        }
        else {
            if (!GICSv2Encoder.sharedContext) {
                GICSv2Encoder.sharedContext = new ContextV0('hash_placeholder');
            }
            this.context = GICSv2Encoder.sharedContext;
            if (!GICSv2Encoder.sharedCHM) {
                // Shared CHM must be careful about runId if multiple streams share it?
                // For testing, we usually reset sharedCHM.
                const envProbe = process.env.GICS_PROBE_INTERVAL;
                const probeInterval = (envProbe !== undefined && envProbe !== '') ? parseInt(envProbe, 10) : 4;
                GICSv2Encoder.sharedCHM = new HealthMonitor(this.runId, probeInterval);
            }
            // If reusing shared CHM, update runId? No, shared is shared.
            // But for determinism test we reset() between runs.
            this.chm = GICSv2Encoder.sharedCHM;
        }
    }
    async addSnapshot(snapshot) {
        if (this.isFinalized)
            throw new Error("GICSv2Encoder: Cannot append after finalize()");
        this.snapshots.push(snapshot);
    }
    getTelemetry() {
        return this.lastTelemetry;
    }
    /**
     * FLUSH: Process buffered snapshots, emit bytes, maintain state.
     */
    async flush() {
        if (this.isFinalized)
            throw new Error("GICSv2Encoder: Cannot flush after finalize()");
        if (this.snapshots.length === 0) {
            return new Uint8Array(0);
        }
        const blocks = [];
        const blockStats = [];
        // Process snapshots
        const timestamps = [];
        const values = [];
        for (const s of this.snapshots) {
            timestamps.push(s.timestamp);
            if (s.items.size > 0) {
                const first = s.items.values().next().value;
                values.push(first ? first.price : 0);
            }
            else {
                values.push(0);
            }
        }
        this.snapshots = [];
        // Helper to process a block
        // Helper to process a block
        const PROBE_INTERVAL = this.chm.PROBE_INTERVAL; // Injected Check recovery every N blocks
        const processBlock = (streamId, chunk, deltas) => {
            const metrics = calculateBlockMetrics(chunk); // Metrics based on RAW values
            const rawInBytes = chunk.length * 8;
            const currentBlockIndex = this.chm.getTotalBlocks() + 1; // 1-based index prediction for logic
            const currentState = this.chm.getState(); // NORMAL or QUARANTINE_ACTIVE.
            // Default choices
            let finalEncoded;
            let finalCodec;
            let allowTrainBaseline = true;
            // --- PROBE LOGIC (Dry Run in Quarantine) ---
            if (currentState === 'QUARANTINE_ACTIVE' && PROBE_INTERVAL > 0 && (currentBlockIndex % PROBE_INTERVAL === 0)) {
                // Dry run Standard Encode to check for recovery
                // We reuse the same logic as Standard Attempt
                let probeEncoded;
                if (this.context.id && metrics.unique_ratio < 0.5) {
                    // MUST CLONE context to avoid mutating main dictionary during probe
                    const probeCtx = this.context.clone();
                    probeEncoded = Codecs.encodeDict(deltas, probeCtx);
                    // probeCtx is discarded here, ensuring no side effects
                }
                else {
                    probeEncoded = encodeVarint(deltas);
                }
                const probeLen = probeEncoded.length + BLOCK_HEADER_SIZE;
                const safeOut = probeLen > 0 ? probeLen : 1;
                const probeRatio = rawInBytes / safeOut;
                // Update Recovery Counter (Side Channel)
                this.chm.probeRecovery(probeRatio, metrics.unique_ratio);
            }
            // --- MAIN ENCODE LOGIC ---
            if (currentState === 'NORMAL') {
                // 1. Standard Encode Attempt
                let stdEncoded;
                let stdCodec;
                if (this.context.id && metrics.unique_ratio < 0.5) {
                    stdCodec = CodecId.DICT_VARINT;
                    stdEncoded = Codecs.encodeDict(deltas, this.context);
                }
                else {
                    stdCodec = (streamId === StreamId.TIME) ? CodecId.DOD_VARINT : CodecId.VARINT_DELTA;
                    stdEncoded = encodeVarint(deltas);
                }
                // 2. Preview Anomaly
                const stdLen = stdEncoded.length + BLOCK_HEADER_SIZE; // Estimating total size for ratio
                // CHM expects payloadOut usually, but ratio = In / Out. 
                // CHM update uses `payloadIn` and `payloadOut` arguments. 
                // Let's pass payload length primarily? 
                // `update` signature: payloadIn, payloadOut, headerBytes.
                // `checkAnomaly` signature: payloadIn, payloadOut, metrics.
                // payloadOut should be just payload or payload+header? 
                // Protocol usually measures ratio on total bytes written to disk (Payload + Header).
                // Existing code passed `stdEncoded.length` (payload only).
                // Let's stick to payload only for consistency unless spec says "Total Block Size".
                // If we use payload only, overhead is ignored.
                // Spec says: "Ratio = In / Out". 
                // Let's use payload length to match previous logic (unless `headerBytes` argument suggests otherwise).
                // `chm.update` takes `headerBytes`. Logic inside uses `payloadOut` for ratio.
                // This implies payloadOut excludes header. 
                // "safeOut = payloadOut > 0 ? payloadOut : 1".
                // So Ratio = Raw / Payload. Overhead is separate.
                const isAnomaly = this.chm.checkAnomaly(rawInBytes, stdEncoded.length, metrics);
                if (isAnomaly) {
                    // Fallback to Safe
                    const safeCodec = (streamId === StreamId.TIME) ? SAFE_CODEC_TIME : SAFE_CODEC_VALUE;
                    const safeEncoded = encodeVarint(deltas);
                    finalEncoded = safeEncoded;
                    finalCodec = safeCodec;
                    allowTrainBaseline = false; // Anomaly detected
                }
                else {
                    finalEncoded = stdEncoded;
                    finalCodec = stdCodec;
                    allowTrainBaseline = true; // Normal
                }
            }
            else {
                // QUARANTINE_ACTIVE
                // Always Force Safe Encode for Output
                // (Exceptions? No, user says "Quarantine encoding uses SAFE_LOGIC")
                const safeCodec = (streamId === StreamId.TIME) ? SAFE_CODEC_TIME : SAFE_CODEC_VALUE;
                const safeEncoded = encodeVarint(deltas);
                finalEncoded = safeEncoded;
                finalCodec = safeCodec;
                allowTrainBaseline = false; // Never train in Quarantine
            }
            // 4. Update CHM (Commit)
            // This manages state transitions using the probe results we might have just updated.
            const chmResult = this.chm.update(metrics, rawInBytes, finalEncoded.length, BLOCK_HEADER_SIZE, currentBlockIndex, finalCodec, allowTrainBaseline);
            // Create Block
            const block = this.createBlock(streamId, finalCodec, chunk.length, finalEncoded, chmResult.flags);
            blocks.push(block);
            blockStats.push({
                stream_id: streamId,
                codec: finalCodec,
                bytes: block.length,
                flags: chmResult.flags,
                health: chmResult.healthTag,
                ratio: rawInBytes / finalEncoded.length,
                trainBaseline: allowTrainBaseline && !chmResult.isAnomaly && !chmResult.inQuarantine,
                // Note: Actual Training logic is internal to CHM now. This `trainBaseline` log might be "requested".
                metrics: metrics,
                regime: classifyRegime(metrics)
            });
        };
        // Create Time Blocks
        for (let i = 0; i < timestamps.length; i += BLOCK_SIZE) {
            const chunk = timestamps.slice(i, i + BLOCK_SIZE);
            const deltas = this.computeTimeDeltas(chunk, true);
            processBlock(StreamId.TIME, chunk, deltas);
        }
        // Create Value Blocks
        for (let i = 0; i < values.length; i += BLOCK_SIZE) {
            const chunk = values.slice(i, i + BLOCK_SIZE);
            const deltas = this.computeValueDeltas(chunk, true);
            processBlock(StreamId.VALUE, chunk, deltas);
        }
        // --- Header Handling ---
        let result;
        // Even if no blocks, we returns empty (handled at top)
        const totalPayloadSize = blocks.reduce((acc, b) => acc + b.length, 0);
        let headerSize = 0;
        let headerBytes = null;
        if (!this.hasEmittedHeader) {
            headerSize = GICS_MAGIC_V2.length + 1 + 4; // Magic(4)+Ver(1)+Flags(4)
            headerBytes = new Uint8Array(headerSize);
            headerBytes.set(GICS_MAGIC_V2, 0);
            headerBytes[4] = GICS_VERSION_BYTE;
            new DataView(headerBytes.buffer).setUint32(5, V12_FLAGS.FIELDWISE_TS, true);
            this.hasEmittedHeader = true;
        }
        const size = (headerBytes ? headerSize : 0) + totalPayloadSize;
        result = new Uint8Array(size);
        let pos = 0;
        if (headerBytes) {
            result.set(headerBytes, pos);
            pos += headerSize;
        }
        for (const b of blocks) {
            result.set(b, pos);
            pos += b.length;
        }
        this.lastTelemetry = {
            blocks: blockStats,
            total_blocks: this.chm.getTotalBlocks()
        };
        return result;
    }
    /**
     * FINALIZE: Seal the stream, write Manifest/Sidecar.
     */
    async finalize() {
        if (this.isFinalized)
            throw new Error("GICSv2Encoder: Finalize called twice!");
        // 1. Emit Sidecar Report
        const report = this.chm.getReport();
        const filename = `gics-anomalies.${this.runId}.json`;
        // Write to CWD
        try {
            const cwd = process.cwd();
            fs.writeFileSync(path.join(cwd, filename), JSON.stringify(report, null, 2));
        }
        catch (e) {
            console.error("Failed to write sidecar report", e);
        }
        // 2. Cleanup
        this.context = null;
        this.isFinalized = true;
        // 3. Telemetry update
        if (this.lastTelemetry) {
            this.lastTelemetry.sidecar = filename;
        }
    }
    createBlock(streamId, codecId, nItems, payload, flags) {
        const block = new Uint8Array(BLOCK_HEADER_SIZE + payload.length);
        const view = new DataView(block.buffer);
        view.setUint8(0, streamId);
        view.setUint8(1, codecId);
        view.setUint32(2, nItems, true);
        view.setUint32(6, payload.length, true);
        view.setUint8(10, flags);
        block.set(payload, BLOCK_HEADER_SIZE);
        return block;
    }
    // --- Delta Computation (Stateful commit) ---
    computeTimeDeltas(timestamps, commitState) {
        const deltas = [];
        let prev = this.context.lastTimestamp !== undefined ? this.context.lastTimestamp : 0;
        let prevDelta = this.context.lastTimestampDelta !== undefined ? this.context.lastTimestampDelta : 0;
        for (let i = 0; i < timestamps.length; i++) {
            const current = timestamps[i];
            const currentDelta = current - prev;
            const deltaOfDelta = currentDelta - prevDelta;
            deltas.push(deltaOfDelta);
            prev = current;
            prevDelta = currentDelta;
        }
        if (commitState) {
            this.context.lastTimestamp = prev;
            this.context.lastTimestampDelta = prevDelta;
        }
        return deltas;
    }
    computeValueDeltas(values, commitState) {
        const deltas = [];
        let prev = this.context.lastValue !== undefined ? this.context.lastValue : 0;
        for (let i = 0; i < values.length; i++) {
            const current = values[i];
            const diff = current - prev;
            deltas.push(diff);
            prev = current;
        }
        if (commitState) {
            this.context.lastValue = prev;
        }
        return deltas.map(Math.round);
    }
}
