import { Snapshot } from '../gics-types.js';
import { encodeVarint } from '../gics-utils.js';
import { GICS_MAGIC_V2, V12_FLAGS, StreamId, InnerCodecId, OuterCodecId, GICS_VERSION_BYTE, HealthTag } from './format.js';
import { ContextV0, ContextSnapshot } from './context.js';
import { calculateBlockMetrics, classifyRegime } from './metrics.js';
import { Codecs } from './codecs.js';
import { HealthMonitor, RoutingDecision } from './chm.js';
import type { GICSv2EncoderOptions } from './types.js';
import { StreamSection, BlockManifestEntry } from './stream-section.js';
import { getOuterCodec } from './outer-codecs.js';
import { IntegrityChain } from './integrity.js';

const BLOCK_SIZE = 1000;

export class GICSv2Encoder {
    private snapshots: Snapshot[] = [];
    private context: ContextV0;
    private readonly chmTime: HealthMonitor;
    private readonly chmValue: HealthMonitor;
    private readonly mode: 'on' | 'off';
    private lastTelemetry: any = null;
    private isFinalized = false;
    private hasEmittedHeader = false;
    private readonly runId: string;
    private readonly options: Required<GICSv2EncoderOptions>;
    private readonly integrity: IntegrityChain;

    static reset() {
        // Backward-compat for existing tests. No global mutable state is used anymore.
    }

    static resetSharedContext() {
        // Backward-compat for existing tests. No global mutable state is used anymore.
    }

    constructor(options: GICSv2EncoderOptions = {}) {
        const defaults: Required<GICSv2EncoderOptions> = {
            runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            contextMode: 'on',
            probeInterval: 4,
            sidecarWriter: null,
            logger: null,
        };
        this.options = { ...defaults, ...options };

        this.runId = this.options.runId;
        this.mode = this.options.contextMode;

        this.context = this.mode === 'off'
            ? new ContextV0('hash_placeholder', null)
            : new ContextV0('hash_placeholder');

        this.chmTime = new HealthMonitor(`${this.runId}:TIME`, this.options.probeInterval, this.options.logger);
        this.chmValue = new HealthMonitor(`${this.runId}:VALUE`, this.options.probeInterval, this.options.logger);

        this.integrity = new IntegrityChain();
    }

    async addSnapshot(snapshot: Snapshot): Promise<void> {
        if (this.isFinalized) throw new Error("GICSv2Encoder: Cannot append after finalize()");
        this.snapshots.push(snapshot);
    }

    getTelemetry() {
        return this.lastTelemetry;
    }

    /**
     * FLUSH: Process buffered snapshots, emit bytes, maintain state.
     */
    async flush(): Promise<Uint8Array> {
        if (this.isFinalized) throw new Error("GICSv2Encoder: Cannot flush after finalize()");
        if (this.snapshots.length === 0) return new Uint8Array(0);

        const features = this.collectDataFeatures();
        this.snapshots = [];

        const streamBlocks: Map<StreamId, { manifest: BlockManifestEntry[], payloads: Uint8Array[] }> = new Map();
        const blockStats: any[] = [];

        const addToStream = (streamId: StreamId, manifest: BlockManifestEntry, payload: Uint8Array) => {
            if (!streamBlocks.has(streamId)) {
                streamBlocks.set(streamId, { manifest: [], payloads: [] });
            }
            const entry = streamBlocks.get(streamId)!;
            entry.manifest.push(manifest);
            entry.payloads.push(payload);
        };

        const processBlockWrapper = (streamId: StreamId, chunk: number[], inputData: number[], stateSnapshot: ContextSnapshot, chm: HealthMonitor) => {
            const result = this.processStreamBlock(streamId, chunk, inputData, stateSnapshot, chm);
            addToStream(streamId, result.manifest, result.payload);
            blockStats.push(result.stats);
        };

        // 1. Core Processing: Generate inner payloads
        this.processTimeBlocks(features.timestamps, processBlockWrapper);
        this.processSnapshotLenBlocks(features.snapshotLengths, addToStream, blockStats);
        this.processItemIdBlocks(features.itemIds, addToStream, blockStats);
        this.processValueBlocks(features.prices, processBlockWrapper);
        this.processQuantityBlocks(features.quantities, addToStream, blockStats);

        // 2. Section Wrapping: Map streams to Sections (Outer Compression + Integrity Chain)
        const sections: Uint8Array[] = [];
        const order = [StreamId.TIME, StreamId.SNAPSHOT_LEN, StreamId.ITEM_ID, StreamId.VALUE, StreamId.QUANTITY];
        const outerCodec = getOuterCodec(OuterCodecId.ZSTD);

        for (const streamId of order) {
            const data = streamBlocks.get(streamId);
            if (!data) continue;

            const concatenated = this.concatArrays(data.payloads);
            const compressed = await outerCodec.compress(concatenated);

            const manifestBytes = StreamSection.serializeManifest(data.manifest);
            const dataToHash = this.concatArrays([
                new Uint8Array([streamId]),
                manifestBytes,
                compressed
            ]);
            const sectionHash = this.integrity.update(dataToHash);

            const section = new StreamSection(
                streamId,
                OuterCodecId.ZSTD,
                data.manifest.length,
                concatenated.length,
                compressed.length,
                sectionHash,
                data.manifest,
                compressed
            );
            sections.push(section.serialize());
        }

        return this.assembleOutput(sections, blockStats);
    }


    private collectDataFeatures() {
        const timestamps: number[] = [];
        const snapshotLengths: number[] = [];
        const itemIds: number[] = [];
        const prices: number[] = [];
        const quantities: number[] = [];

        for (const s of this.snapshots) {
            timestamps.push(s.timestamp);
            const sortedItems = [...s.items.entries()].sort((a, b) => a[0] - b[0]);
            snapshotLengths.push(sortedItems.length);
            for (const [id, data] of sortedItems) {
                itemIds.push(id);
                prices.push(data.price);
                quantities.push(data.quantity);
            }
        }
        return { timestamps, snapshotLengths, itemIds, prices, quantities };
    }

    private processTimeBlocks(timestamps: number[], processBlock: Function) {
        for (let i = 0; i < timestamps.length; i += BLOCK_SIZE) {
            const chunk = timestamps.slice(i, i + BLOCK_SIZE);
            const snapshot = this.context.snapshot();
            const deltas = this.computeTimeDeltas(chunk, true);
            processBlock(StreamId.TIME, chunk, deltas, snapshot, this.chmTime);
        }
    }

    private processSnapshotLenBlocks(lengths: number[], addToStream: Function, stats: any[]) {
        for (let i = 0; i < lengths.length; i += BLOCK_SIZE) {
            const chunk = lengths.slice(i, i + BLOCK_SIZE);
            const encoded = encodeVarint(chunk);
            addToStream(StreamId.SNAPSHOT_LEN, { innerCodecId: InnerCodecId.VARINT_DELTA, nItems: chunk.length, payloadLen: encoded.length, flags: 0 }, encoded);
            this.recordSimpleBlockStats(StreamId.SNAPSHOT_LEN, chunk, encoded, stats);
        }
    }

    private processItemIdBlocks(itemIds: number[], addToStream: Function, stats: any[]) {
        for (let i = 0; i < itemIds.length; i += BLOCK_SIZE) {
            const chunk = itemIds.slice(i, i + BLOCK_SIZE);
            const encoded = encodeVarint(chunk);
            addToStream(StreamId.ITEM_ID, { innerCodecId: InnerCodecId.VARINT_DELTA, nItems: chunk.length, payloadLen: encoded.length, flags: 0 }, encoded);
            this.recordSimpleBlockStats(StreamId.ITEM_ID, chunk, encoded, stats);
        }
    }

    private processValueBlocks(prices: number[], processBlock: Function) {
        for (let i = 0; i < prices.length; i += BLOCK_SIZE) {
            const chunk = prices.slice(i, i + BLOCK_SIZE);
            const snapshot = this.context.snapshot();
            const deltas = this.computeValueDeltas(chunk, true);
            processBlock(StreamId.VALUE, chunk, deltas, snapshot, this.chmValue);
        }
    }

    private processQuantityBlocks(quantities: number[], addToStream: Function, stats: any[]) {
        for (let i = 0; i < quantities.length; i += BLOCK_SIZE) {
            const chunk = quantities.slice(i, i + BLOCK_SIZE);
            const encoded = encodeVarint(chunk);
            addToStream(StreamId.QUANTITY, { innerCodecId: InnerCodecId.VARINT_DELTA, nItems: chunk.length, payloadLen: encoded.length, flags: 0 }, encoded);
            this.recordSimpleBlockStats(StreamId.QUANTITY, chunk, encoded, stats);
        }
    }

    private recordSimpleBlockStats(streamId: StreamId, chunk: number[], encoded: Uint8Array, stats: any[]) {
        const metrics = calculateBlockMetrics(chunk);
        stats.push({
            stream_id: streamId,
            codec: InnerCodecId.VARINT_DELTA,
            bytes: encoded.length,
            raw_bytes: chunk.length * 8,
            header_bytes: 0,
            payload_bytes: encoded.length,
            params: { decision: 'CORE', reason: null },
            flags: 0,
            health: HealthTag.OK,
            ratio: (chunk.length * 8) / (encoded.length || 1),
            trainBaseline: true,
            metrics: metrics,
            regime: classifyRegime(metrics)
        });
    }

    private processStreamBlock(
        streamId: StreamId,
        chunk: number[],
        inputData: number[],
        stateSnapshot: ContextSnapshot,
        chm: HealthMonitor
    ) {
        const metrics = calculateBlockMetrics(chunk);
        const rawInBytes = chunk.length * 8;
        const currentBlockIndex = chm.getTotalBlocks() + 1;

        const { candidateEncoded, candidateCodec } = this.selectBestCodec(streamId, inputData, metrics, stateSnapshot);
        const candidateRatio = rawInBytes / (candidateEncoded.length || 1);

        const route = chm.decideRoute(metrics, candidateRatio, currentBlockIndex);

        let finalEncoded: Uint8Array;
        let finalCodec: InnerCodecId;

        if (route.decision === RoutingDecision.QUARANTINE) {
            this.context.restore(stateSnapshot);
            finalEncoded = encodeVarint(inputData);
            finalCodec = (streamId === StreamId.TIME) ? InnerCodecId.DOD_VARINT : InnerCodecId.VARINT_DELTA;
        } else {
            finalEncoded = candidateEncoded;
            finalCodec = candidateCodec;
        }

        const chmResult = chm.update(route.decision, metrics, rawInBytes, finalEncoded.length, 0, currentBlockIndex, finalCodec);

        return {
            manifest: { innerCodecId: finalCodec, nItems: chunk.length, payloadLen: finalEncoded.length, flags: chmResult.flags },
            payload: finalEncoded,
            stats: {
                stream_id: streamId,
                codec: finalCodec,
                bytes: finalEncoded.length,
                raw_bytes: rawInBytes,
                header_bytes: 0,
                payload_bytes: finalEncoded.length,
                params: { decision: route.decision, reason: route.reason },
                flags: chmResult.flags,
                health: chmResult.healthTag,
                ratio: rawInBytes / (finalEncoded.length || 1),
                trainBaseline: (route.decision === RoutingDecision.CORE),
                metrics: metrics,
                regime: classifyRegime(metrics)
            }
        };
    }

    private assembleOutput(sections: Uint8Array[], blockStats: any[]): Uint8Array {
        const sectionsData = this.concatArrays(sections);
        let headerSize = 0;
        let headerBytes: Uint8Array | null = null;

        if (!this.hasEmittedHeader) {
            headerSize = GICS_MAGIC_V2.length + 1 + 4;
            headerBytes = new Uint8Array(headerSize);
            headerBytes.set(GICS_MAGIC_V2, 0);
            headerBytes[4] = GICS_VERSION_BYTE;
            new DataView(headerBytes.buffer).setUint32(5, V12_FLAGS.FIELDWISE_TS, true);
            this.hasEmittedHeader = true;
        }

        const result = new Uint8Array((headerBytes ? headerSize : 0) + sectionsData.length + 1);
        let pos = 0;
        if (headerBytes) {
            result.set(headerBytes, pos);
            pos += headerSize;
        }
        result.set(sectionsData, pos);
        pos += sectionsData.length;
        result[pos] = 0xFF; // EOS

        this.computeTelemetry(blockStats);
        return result;
    }

    private computeTelemetry(blockStats: any[]) {
        const timeStats = this.chmTime.getStats();
        const valueStats = this.chmValue.getStats();
        const chmStats = {
            core_blocks: timeStats.core_blocks + valueStats.core_blocks,
            core_input_bytes: timeStats.core_input_bytes + valueStats.core_input_bytes,
            core_output_bytes: timeStats.core_output_bytes + valueStats.core_output_bytes,
            quar_blocks: timeStats.quar_blocks + valueStats.quar_blocks,
            quar_input_bytes: timeStats.quar_input_bytes + valueStats.quar_input_bytes,
            quar_output_bytes: timeStats.quar_output_bytes + valueStats.quar_output_bytes,
        };

        const totalChmBlocks = this.chmTime.getTotalBlocks() + this.chmValue.getTotalBlocks();
        const coreRatio = chmStats.core_output_bytes > 0 ? (chmStats.core_input_bytes / chmStats.core_output_bytes) : 0;
        const quarRate = totalChmBlocks > 0 ? (chmStats.quar_blocks / totalChmBlocks) : 0;

        this.lastTelemetry = {
            blocks: blockStats,
            total_blocks: totalChmBlocks,
            core_input_bytes: chmStats.core_input_bytes,
            core_output_bytes: chmStats.core_output_bytes,
            core_ratio: coreRatio,
            quarantine_input_bytes: chmStats.quar_input_bytes,
            quarantine_output_bytes: chmStats.quar_output_bytes,
            quarantine_rate: quarRate,
            quarantine_blocks: chmStats.quar_blocks
        };
    }

    async finalize(): Promise<void> {
        if (this.isFinalized) throw new Error("GICSv2Encoder: Finalize called twice!");

        const report = {
            time: this.chmTime.getReport(),
            value: this.chmValue.getReport(),
        };
        const filename = `gics-anomalies.${this.runId}.json`;

        if (this.options.sidecarWriter) {
            await this.options.sidecarWriter({ filename, report, encoderRunId: this.runId });
        }

        this.context = null as any;
        this.isFinalized = true;

        if (this.lastTelemetry) {
            this.lastTelemetry.sidecar = this.options.sidecarWriter ? filename : null;
        }
    }

    async finish(): Promise<Uint8Array> {
        return this.flush();
    }

    private computeTimeDeltas(timestamps: number[], commitState: boolean): number[] {
        const deltas: number[] = [];
        let prev = this.context.lastTimestamp ?? 0;
        let prevDelta = this.context.lastTimestampDelta ?? 0;

        for (const current of timestamps) {
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

    private computeValueDeltas(values: number[], commitState: boolean): number[] {
        const deltas: number[] = [];
        let prev = this.context.lastValue ?? 0;
        let prevDelta = this.context.lastValueDelta ?? 0;

        for (const current of values) {
            const diff = current - prev;
            deltas.push(diff);
            prevDelta = diff;
            prev = current;
        }

        if (commitState) {
            this.context.lastValue = prev;
            this.context.lastValueDelta = prevDelta;
        }
        return deltas.map(Math.round);
    }

    private selectBestCodec(streamId: StreamId, inputData: number[], metrics: any, stateSnapshot: ContextSnapshot): { candidateEncoded: Uint8Array, candidateCodec: InnerCodecId } {
        let candidateEncoded: Uint8Array;
        let candidateCodec: InnerCodecId;

        if (this.context.id && streamId === StreamId.VALUE && metrics.unique_ratio < 0.5) {
            candidateCodec = InnerCodecId.DICT_VARINT;
            candidateEncoded = Codecs.encodeDict(inputData, this.context);
        } else if (metrics.dod_zero_ratio > 0.9) {
            candidateCodec = InnerCodecId.RLE_DOD;
            candidateEncoded = Codecs.encodeRLE(this.prepareDODStream(streamId, inputData, stateSnapshot));
        } else if (metrics.p90_abs_delta < 127) {
            candidateCodec = InnerCodecId.BITPACK_DELTA;
            candidateEncoded = Codecs.encodeBitPack(inputData);
        } else if (streamId === StreamId.TIME) {
            candidateCodec = InnerCodecId.DOD_VARINT;
            candidateEncoded = encodeVarint(inputData);
        } else {
            candidateCodec = InnerCodecId.VARINT_DELTA;
            candidateEncoded = encodeVarint(inputData);
        }

        return { candidateEncoded, candidateCodec };
    }

    private prepareDODStream(streamId: StreamId, inputData: number[], stateSnapshot: ContextSnapshot): number[] {
        if (streamId === StreamId.TIME) return inputData;

        const dodStream: number[] = [];
        let pd = stateSnapshot.lastValueDelta ?? 0;
        for (const d of inputData) {
            dodStream.push(d - pd);
            pd = d;
        }
        return dodStream;
    }

    private concatArrays(arrays: Uint8Array[]): Uint8Array {
        const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }
}
