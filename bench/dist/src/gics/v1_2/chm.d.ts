/**
 * Compression Health Monitor (CHM)
 * Tracks entropy and compression ratio to detect anomalies (Regime Shifts).
 */
import { BlockMetrics } from './metrics.js';
import { HealthTag } from './format.js';
export interface AnomalyReport {
    schema_version: 1;
    run_id: string;
    gics_version: string;
    segments: AnomalySegment[];
    worst_blocks: WorstBlock[];
}
export interface AnomalySegment {
    segment_id: string;
    start_block_index: number;
    end_block_index?: number;
    reason_code: string;
    min_ratio: number;
    max_unique_ratio_proxy: number;
    suggested_action: string;
    probe_attempts?: number;
    probe_successes?: number;
}
export interface WorstBlock {
    block_index: number;
    ratio: number;
    entropy: number;
    codec_id: number;
}
export declare enum CHMState {
    NORMAL = "NORMAL",
    QUARANTINE_ACTIVE = "QUARANTINE_ACTIVE"
}
export declare class HealthMonitor {
    private runId;
    readonly K_RATIO_DEV_TRIGGER = 3;
    readonly K_RATIO_DEV_RECOVERY = 10;
    readonly PROBE_INTERVAL: number;
    readonly M_RECOVERY_BLOCKS = 3;
    private readonly EMA_ALPHA;
    private state;
    private baselineRatio;
    private baselineRatioDev;
    private baselineUniqueRatioProxy;
    private frozenBaselineRatio;
    private totalBlocks;
    private quarantineStartBlock;
    private recoveryCounter;
    private anomalies;
    private worstBlocks;
    private lastBlockIndexSeen;
    private currentSegment;
    constructor(runId: string, probeInterval?: number);
    /**
     * PROBE RECOVERY (Deterministic Side-Channel)
     * Checks if a dry-run Normal Encode would satisfy baseline requirements.
     * Updates recoveryCounter but DOES NOT update baseline or state.
     */
    probeRecovery(probeRatio: number, uniqueRatio: number): boolean;
    /**
     * Updates the CHM state with new block metrics.
     * This is the SINGLE SOURCE OF TRUTH for:
     * - Anomaly State (Normal vs Quarantine)
     * - Baseline Updates (Training vs Frozen)
     * - Flag Emission (Start, Mid, End)
     */
    update(metrics: BlockMetrics, payloadIn: number, payloadOut: number, headerBytes: number, blockIndex: number, codecId: number, allowTrainBaseline: boolean): {
        flags: number;
        healthTag: HealthTag;
        isAnomaly: boolean;
        inQuarantine: boolean;
        reasonCode: string | null;
    };
    /**
     * Preview Check (Stateless deviation check)
     */
    checkAnomaly(payloadIn: number, payloadOut: number, metrics: BlockMetrics): boolean;
    private detectAnomaly;
    getReport(): AnomalyReport;
    private updateWorstBlocks;
    getTotalBlocks(): number;
    getState(): CHMState;
}
