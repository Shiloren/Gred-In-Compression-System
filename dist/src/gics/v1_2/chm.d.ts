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
export declare enum RoutingDecision {
    CORE = "CORE",
    QUARANTINE = "QUARANTINE"
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
    private stats;
    getStats(): {
        core_blocks: number;
        core_input_bytes: number;
        core_output_bytes: number;
        quar_blocks: number;
        quar_input_bytes: number;
        quar_output_bytes: number;
    };
    private anomalies;
    private worstBlocks;
    private lastBlockIndexSeen;
    private currentSegment;
    constructor(runId: string, probeInterval?: number);
    /**
     * DECIDE ROUTE (Router-First)
     * Determines whether the block belongs in CORE or QUARANTINE.
     * Does NOT update state (stateless check).
     * @param probeRatio - Ratio from a dry-run encode (Normal Attempt). Required if in Normal or Probing.
     */
    decideRoute(metrics: BlockMetrics, probeRatio: number): {
        decision: RoutingDecision;
        reason: string | null;
    };
    /**
     * Updates the CHM state based on the Routing Decision executed by the Encoder.
     */
    update(decision: RoutingDecision, metrics: BlockMetrics, payloadIn: number, payloadOut: number, headerBytes: number, blockIndex: number, codecId: number): {
        flags: number;
        healthTag: HealthTag;
        isAnomaly: boolean;
        inQuarantine: boolean;
        reasonCode: string | null;
    };
    private checkRecoveryCriteria;
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
