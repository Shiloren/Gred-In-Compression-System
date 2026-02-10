/**
 * Compression Health Monitor (CHM)
 * Tracks entropy and compression ratio to detect anomalies (Regime Shifts).
 */

import { BlockMetrics } from './metrics.js';
import { HealthTag, BLOCK_FLAGS } from './format.js';
import type { GICSv2Logger } from './types.js';

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
    end_block_index?: number; // open if undefined
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

export enum RoutingDecision {
    CORE = 'CORE',
    QUARANTINE = 'QUARANTINE'
}

export enum CHMState {
    NORMAL = 'NORMAL',
    QUARANTINE_ACTIVE = 'QUARANTINE_ACTIVE'
}

export class HealthMonitor {
    // Config (Fixed Defaults per Spec)
    // CHM Configuration (Split-4.2.1 Hardening)
    public readonly K_RATIO_DEV_TRIGGER = 3;   // Trigger threshold (Sigma)
    public readonly K_RATIO_DEV_RECOVERY = 10;  // Recovery threshold (Sigma)
    public readonly PROBE_INTERVAL: number;       // Blocks between probes (Injected)
    public readonly M_RECOVERY_BLOCKS = 3;       // Consecutive successes needed
    private readonly EMA_ALPHA = 0.1;            // Smoothing factor

    // State
    private state: CHMState = CHMState.NORMAL;

    // Baseline Statstics (Exponential Moving Average)
    private baselineRatio: number = 2; // Initial optimistic guess
    private baselineRatioDev: number = 0.5;
    private baselineUniqueRatioProxy: number = 0.5; // "Entropy"

    // Frozen Baselines (Snapshot at Anomaly Start)
    private frozenBaselineRatio: number | null = null;

    // State Tracking
    private totalBlocks = 0;
    private recoveryCounter = 0;

    // Split-5 Stats
    private readonly stats = {
        core_blocks: 0,
        core_input_bytes: 0,
        core_output_bytes: 0,
        quar_blocks: 0,
        quar_input_bytes: 0,
        quar_output_bytes: 0
    };

    getStats() {
        return { ...this.stats };
    }

    // Reporting
    private readonly anomalies: AnomalySegment[] = [];
    private worstBlocks: WorstBlock[] = []; // Top 10 worst

    // History
    private lastBlockIndexSeen = 0;

    private currentSegment: AnomalySegment | null = null;

    private readonly logger: GICSv2Logger | null;

    constructor(private readonly runId: string, probeInterval: number = 4, logger: GICSv2Logger | null = null) {
        this.PROBE_INTERVAL = probeInterval;
        this.logger = logger;
    }

    decideRoute(metrics: BlockMetrics, probeRatio: number, blockIndex: number): { decision: RoutingDecision, reason: string | null } {
        if (this.checkEntropyGate(metrics)) {
            return { decision: RoutingDecision.QUARANTINE, reason: 'ENTROPY_GATE' };
        }

        if (this.state === CHMState.NORMAL) {
            return this.decideNormalRoute(probeRatio, metrics.unique_ratio);
        }

        if (this.state === CHMState.QUARANTINE_ACTIVE) {
            return this.decideQuarantineRoute(probeRatio, blockIndex);
        }

        return { decision: RoutingDecision.CORE, reason: null };
    }

    private checkEntropyGate(metrics: BlockMetrics): boolean {
        return metrics.unique_ratio > 0.85 && metrics.unique_delta_ratio > 0.85;
    }

    private decideNormalRoute(probeRatio: number, uniqueRatio: number): { decision: RoutingDecision, reason: string | null } {
        const detection = this.detectAnomaly(probeRatio, uniqueRatio);
        if (detection.isAnomaly) {
            this.logger?.info?.(`[CHM] ANOMALY DETECTED! Ratio=${probeRatio.toFixed(2)} < Threshold. Base=${this.baselineRatio.toFixed(2)} Reason=${detection.reason}`);
            return { decision: RoutingDecision.QUARANTINE, reason: detection.reason };
        }
        return { decision: RoutingDecision.CORE, reason: null };
    }

    private decideQuarantineRoute(probeRatio: number, blockIndex: number): { decision: RoutingDecision, reason: string | null } {
        const shouldProbe = (blockIndex % this.PROBE_INTERVAL) === 0;
        if (!shouldProbe) {
            return { decision: RoutingDecision.QUARANTINE, reason: 'QUARANTINE_ACTIVE' };
        }

        const isGood = this.checkRecoveryCriteria(probeRatio);
        if (isGood && this.recoveryCounter + 1 >= this.M_RECOVERY_BLOCKS) {
            return { decision: RoutingDecision.CORE, reason: 'RECOVERY_MATCH' };
        }

        return {
            decision: RoutingDecision.QUARANTINE,
            reason: isGood ? 'RECOVERY_PENDING' : 'RECOVERY_PROBE_FAIL'
        };
    }

    update(
        decision: RoutingDecision,
        metrics: BlockMetrics,
        payloadIn: number,
        payloadOut: number,
        headerBytes: number,
        blockIndex: number,
        codecId: number
    ): { flags: number; healthTag: HealthTag; isAnomaly: boolean; inQuarantine: boolean; reasonCode: string | null } {
        this.totalBlocks++;
        this.lastBlockIndexSeen = blockIndex;

        this.updateStats(decision, payloadIn, payloadOut, headerBytes);

        const currentRatio = payloadIn / (payloadOut > 0 ? payloadOut : 1);
        const logicResult = this.updateStateLogic(decision, metrics, currentRatio, blockIndex);

        this.trainBaselineIfNeeded(decision, logicResult.flags, currentRatio, metrics.unique_ratio);
        this.updateWorstBlocks(blockIndex, currentRatio, metrics.unique_ratio, codecId);

        return {
            flags: logicResult.flags,
            healthTag: logicResult.healthTag,
            isAnomaly: logicResult.isAnomaly,
            inQuarantine: this.state === CHMState.QUARANTINE_ACTIVE,
            reasonCode: logicResult.reasonCode
        };
    }

    private trainBaselineIfNeeded(decision: RoutingDecision, flags: number, ratio: number, uniqueRatio: number) {
        const canTrain = (decision === RoutingDecision.CORE)
            && ((flags & BLOCK_FLAGS.ANOMALY_END) === 0)
            && (uniqueRatio <= 0.8);

        if (canTrain) {
            this.trainBaseline(ratio, uniqueRatio);
        }
    }

    private updateStats(decision: RoutingDecision, payloadIn: number, payloadOut: number, headerBytes: number) {
        if (decision === RoutingDecision.CORE) {
            this.stats.core_blocks++;
            this.stats.core_input_bytes += payloadIn;
            this.stats.core_output_bytes += (payloadOut + headerBytes);
        } else {
            this.stats.quar_blocks++;
            this.stats.quar_input_bytes += payloadIn;
            this.stats.quar_output_bytes += (payloadOut + headerBytes);
        }
    }

    private updateStateLogic(decision: RoutingDecision, metrics: BlockMetrics, currentRatio: number, blockIndex: number) {
        if (this.state === CHMState.NORMAL) {
            return this.handleNormalState(decision, metrics, currentRatio, blockIndex);
        } else {
            return this.handleQuarantineState(decision, metrics, currentRatio, blockIndex);
        }
    }

    private handleNormalState(decision: RoutingDecision, metrics: BlockMetrics, currentRatio: number, blockIndex: number) {
        let flags = 0;
        let healthTag: HealthTag = HealthTag.OK;
        let isAnomaly = false;
        let reasonCode: string | null = null;

        if (decision === RoutingDecision.QUARANTINE) {
            this.state = CHMState.QUARANTINE_ACTIVE;
            this.frozenBaselineRatio = this.baselineRatio;
            this.recoveryCounter = 0;

            flags |= BLOCK_FLAGS.ANOMALY_START;
            flags |= BLOCK_FLAGS.HEALTH_QUAR;
            healthTag = HealthTag.QUAR;
            isAnomaly = true;
            const det = this.detectAnomaly(currentRatio, metrics.unique_ratio);
            reasonCode = det.reason || 'UNKNOWN';

            this.currentSegment = {
                segment_id: `seg_${this.anomalies.length + 1}`,
                start_block_index: blockIndex,
                reason_code: reasonCode,
                min_ratio: currentRatio,
                max_unique_ratio_proxy: metrics.unique_ratio,
                suggested_action: 'INSPECT',
                probe_attempts: 0,
                probe_successes: 0
            };
            this.anomalies.push(this.currentSegment);
        }

        return { flags, healthTag, isAnomaly, reasonCode };
    }

    private handleQuarantineState(decision: RoutingDecision, metrics: BlockMetrics, currentRatio: number, blockIndex: number) {
        let flags = 0;
        let healthTag: HealthTag;
        let isAnomaly = false;
        const reasonCode: string | null = null;

        if (decision === RoutingDecision.CORE) {
            this.state = CHMState.NORMAL;
            this.frozenBaselineRatio = null;
            flags |= BLOCK_FLAGS.ANOMALY_END;
            healthTag = HealthTag.OK;
            if (this.currentSegment) {
                this.currentSegment.end_block_index = blockIndex;
                this.currentSegment = null;
            }
            this.recoveryCounter = 0;
        } else {
            this.handleQuarantineProbe(currentRatio, blockIndex, metrics);
            flags |= BLOCK_FLAGS.ANOMALY_MID | BLOCK_FLAGS.HEALTH_QUAR;
            healthTag = HealthTag.QUAR;
            isAnomaly = true;
        }
        return { flags, healthTag, isAnomaly, reasonCode };
    }

    private handleQuarantineProbe(currentRatio: number, blockIndex: number, metrics: BlockMetrics) {
        const shouldProbe = (blockIndex % this.PROBE_INTERVAL) === 0;
        if (shouldProbe) {
            const isGood = this.checkRecoveryCriteria(currentRatio);
            if (isGood) {
                this.recoveryCounter++;
                if (this.currentSegment) {
                    this.currentSegment.probe_successes = (this.currentSegment.probe_successes || 0) + 1;
                }
            } else {
                this.recoveryCounter = 0;
            }
            if (this.currentSegment) {
                this.currentSegment.probe_attempts = (this.currentSegment.probe_attempts || 0) + 1;
            }
        }

        if (this.currentSegment) {
            this.currentSegment.min_ratio = Math.min(this.currentSegment.min_ratio, currentRatio);
            this.currentSegment.max_unique_ratio_proxy = Math.max(this.currentSegment.max_unique_ratio_proxy, metrics.unique_ratio);
        }
    }

    private trainBaseline(currentRatio: number, uniqueRatio: number) {
        if (this.totalBlocks <= 1) {
            this.baselineRatio = currentRatio;
            this.baselineRatioDev = currentRatio * 0.1;
            this.baselineUniqueRatioProxy = uniqueRatio;
        } else {
            const prevBaseline = this.baselineRatio;
            this.baselineRatio = (this.EMA_ALPHA * currentRatio) + ((1 - this.EMA_ALPHA) * this.baselineRatio);
            const dev = Math.abs(currentRatio - prevBaseline);
            this.baselineRatioDev = (this.EMA_ALPHA * dev) + ((1 - this.EMA_ALPHA) * this.baselineRatioDev);
            this.baselineUniqueRatioProxy = (this.EMA_ALPHA * uniqueRatio) + ((1 - this.EMA_ALPHA) * this.baselineUniqueRatioProxy);
        }
    }

    private checkRecoveryCriteria(probeRatio: number): boolean {
        const referenceRatio = this.frozenBaselineRatio || this.baselineRatio;
        const effectiveDev = Math.max(this.baselineRatioDev, 0.1);
        const recoveryThreshold = referenceRatio - (this.K_RATIO_DEV_RECOVERY * effectiveDev);
        return probeRatio >= recoveryThreshold;
    }


    /**
     * Preview Check (Stateless deviation check)
     */
    checkAnomaly(payloadIn: number, payloadOut: number, metrics: BlockMetrics): boolean {
        const safeOut = payloadOut > 0 ? payloadOut : 1;
        const r = payloadIn / safeOut;
        return this.detectAnomaly(r, metrics.unique_ratio).isAnomaly;
    }

    private detectAnomaly(currentRatio: number, uniqueRatio: number): { isAnomaly: boolean, reason: string } {
        const expectedRatio = this.state === CHMState.NORMAL ? this.baselineRatio : (this.frozenBaselineRatio || this.baselineRatio);

        let effectiveDev = this.baselineRatioDev;
        // Search threshold for anomaly
        if (effectiveDev * this.K_RATIO_DEV_TRIGGER > expectedRatio * 0.9) {
            effectiveDev = (expectedRatio * 0.9) / this.K_RATIO_DEV_TRIGGER;
        }

        const threshold = expectedRatio - (this.K_RATIO_DEV_TRIGGER * effectiveDev);

        const isRatioDrop = currentRatio < threshold;

        // Entropy Burst: High entropy (> 1.5x baseline) + LOW ratio (below expected)
        const isEntropyBurst = (uniqueRatio > (this.baselineUniqueRatioProxy * 1.5)) &&
            (uniqueRatio > 0.5) &&
            (currentRatio < expectedRatio);

        if (isRatioDrop) return { isAnomaly: true, reason: 'RATIO_DROP' };
        if (isEntropyBurst) return { isAnomaly: true, reason: 'ENTROPY_BURST' };

        return { isAnomaly: false, reason: '' };
    }

    getReport(): AnomalyReport {
        // Close any open segment
        if (this.currentSegment) {
            this.currentSegment.end_block_index = this.lastBlockIndexSeen; // Force close
            this.currentSegment = null;
        }

        return {
            schema_version: 1,
            run_id: this.runId,
            gics_version: '1.3',
            segments: this.anomalies,
            worst_blocks: this.worstBlocks
        };
    }

    private updateWorstBlocks(blockIndex: number, ratio: number, uniqueRatio: number, codecId: number) {
        this.worstBlocks.push({ block_index: blockIndex, ratio, entropy: uniqueRatio, codec_id: codecId });
        this.worstBlocks.sort((a, b) => a.ratio - b.ratio); // Ascending (worst first)
        if (this.worstBlocks.length > 10) {
            this.worstBlocks = this.worstBlocks.slice(0, 10);
        }
    }

    getTotalBlocks() { return this.totalBlocks; }
    getState() { return this.state; }
}
