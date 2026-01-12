/**
 * Compression Health Monitor (CHM)
 * Tracks entropy and compression ratio to detect anomalies (Regime Shifts).
 */
import { HealthTag, BLOCK_FLAGS } from './format.js';
export var CHMState;
(function (CHMState) {
    CHMState["NORMAL"] = "NORMAL";
    CHMState["QUARANTINE_ACTIVE"] = "QUARANTINE_ACTIVE";
})(CHMState || (CHMState = {}));
export class HealthMonitor {
    runId;
    // Config (Fixed Defaults per Spec)
    // CHM Configuration (Split-4.2.1 Hardening)
    K_RATIO_DEV_TRIGGER = 3.0; // Trigger threshold (Sigma)
    K_RATIO_DEV_RECOVERY = 10.0; // Recovery threshold (Sigma) - RELAXED from 1.0 to 10.0 for SAFE MODE gap
    PROBE_INTERVAL; // Blocks between probes (Injected)
    M_RECOVERY_BLOCKS = 3; // Consecutive successes needed
    EMA_ALPHA = 0.1; // Smoothing factor
    // State
    state = CHMState.NORMAL;
    // Baseline Statstics (Exponential Moving Average)
    baselineRatio = 2.0; // Initial optimistic guess
    baselineRatioDev = 0.5;
    baselineUniqueRatioProxy = 0.5; // "Entropy"
    // Frozen Baselines (Snapshot at Anomaly Start)
    frozenBaselineRatio = null;
    // State Tracking
    totalBlocks = 0;
    quarantineStartBlock = -1;
    recoveryCounter = 0;
    // Reporting
    anomalies = [];
    worstBlocks = []; // Top 10 worst
    // History
    lastBlockIndexSeen = 0;
    currentSegment = null;
    constructor(runId, probeInterval = 4) {
        this.runId = runId;
        this.PROBE_INTERVAL = probeInterval;
    }
    /**
     * PROBE RECOVERY (Deterministic Side-Channel)
     * Checks if a dry-run Normal Encode would satisfy baseline requirements.
     * Updates recoveryCounter but DOES NOT update baseline or state.
     */
    probeRecovery(probeRatio, uniqueRatio) {
        const seg = this.anomalies[this.anomalies.length - 1];
        if (this.state === CHMState.QUARANTINE_ACTIVE && seg && !seg.end_block_index) {
            seg.probe_attempts = (seg.probe_attempts || 0) + 1;
        }
        const referenceRatio = this.frozenBaselineRatio || this.baselineRatio;
        const effectiveDev = Math.max(this.baselineRatioDev, 0.1); // [HARDENING] Prevent overfitting to perfectly stable streams
        const recoveryThreshold = referenceRatio - (this.K_RATIO_DEV_RECOVERY * effectiveDev);
        const isRecovered = probeRatio >= recoveryThreshold;
        // DEBUG LOG
        if (this.state === CHMState.QUARANTINE_ACTIVE) {
            console.log(`[CHM] Probe: Ratio=${probeRatio.toFixed(2)} Threshold=${recoveryThreshold.toFixed(2)} Base=${referenceRatio.toFixed(2)} Dev=${this.baselineRatioDev.toFixed(2)} -> ${isRecovered ? 'RECOVERED' : 'FAIL'}`);
        }
        if (isRecovered) {
            this.recoveryCounter++;
            if (this.state === CHMState.QUARANTINE_ACTIVE && seg && !seg.end_block_index) {
                seg.probe_successes = (seg.probe_successes || 0) + 1;
            }
        }
        else {
            this.recoveryCounter = 0;
        }
        return isRecovered;
    }
    /**
     * Updates the CHM state with new block metrics.
     * This is the SINGLE SOURCE OF TRUTH for:
     * - Anomaly State (Normal vs Quarantine)
     * - Baseline Updates (Training vs Frozen)
     * - Flag Emission (Start, Mid, End)
     */
    update(metrics, payloadIn, payloadOut, headerBytes, blockIndex, codecId, allowTrainBaseline) {
        this.totalBlocks++;
        this.lastBlockIndexSeen = blockIndex;
        // 1. Compute Normalized Ratio
        const safeOut = payloadOut > 0 ? payloadOut : 1;
        const currentRatio = payloadIn / safeOut;
        // 2. State Logic
        let flags = 0;
        let healthTag = HealthTag.OK;
        let blockAnomalous = false;
        let reasonCode = null;
        if (this.state === CHMState.NORMAL) {
            // DETECT ANOMALY
            // Re-verify detection even if Encoder suggested Safe (allowTrainBaseline=false)
            // If Encoder forced safe, it's NOT necessarily a CHM anomaly unless CHM agrees.
            // But if Encoder used Safe, ratio might be inherently low.
            // The constraint is: If CHM detects anomaly, we switch to Quarantine.
            const detection = this.detectAnomaly(currentRatio, metrics.unique_ratio);
            if (detection.isAnomaly) {
                // TRANSITION: NORMAL -> QUARANTINE
                this.state = CHMState.QUARANTINE_ACTIVE;
                this.frozenBaselineRatio = this.baselineRatio; // Freeze
                this.recoveryCounter = 0;
                this.quarantineStartBlock = blockIndex;
                flags |= BLOCK_FLAGS.ANOMALY_START;
                flags |= BLOCK_FLAGS.HEALTH_QUAR;
                healthTag = HealthTag.QUAR;
                blockAnomalous = true;
                reasonCode = detection.reason;
                // Start Segment
                this.currentSegment = {
                    segment_id: `seg_${this.anomalies.length + 1}`,
                    start_block_index: blockIndex,
                    reason_code: detection.reason,
                    min_ratio: currentRatio,
                    max_unique_ratio_proxy: metrics.unique_ratio,
                    suggested_action: 'INSPECT',
                    probe_attempts: 0,
                    probe_successes: 0
                };
                this.anomalies.push(this.currentSegment);
            }
            else {
                // REMAIN NORMAL
                healthTag = HealthTag.OK;
            }
        }
        else {
            // QUARANTINE ACTIVE
            // Check for Recovery
            // The `recoveryCounter` is updated by `probeRecovery` BEFORE this call (by Encoder).
            if (this.recoveryCounter >= this.M_RECOVERY_BLOCKS) {
                // TRANSITION: QUARANTINE -> NORMAL
                // This block is MARKED as the End.
                this.state = CHMState.NORMAL;
                this.frozenBaselineRatio = null; // Unfreeze
                flags |= BLOCK_FLAGS.ANOMALY_END;
                healthTag = HealthTag.OK; // Signal resolution
                // Close Segment
                if (this.currentSegment) {
                    this.currentSegment.end_block_index = blockIndex;
                    this.currentSegment = null;
                }
                this.recoveryCounter = 0;
            }
            else {
                // REMAIN QUARANTINE
                flags |= BLOCK_FLAGS.ANOMALY_MID;
                flags |= BLOCK_FLAGS.HEALTH_QUAR;
                healthTag = HealthTag.QUAR;
                blockAnomalous = true;
                // Update Segment Stats
                if (this.currentSegment) {
                    this.currentSegment.min_ratio = Math.min(this.currentSegment.min_ratio, currentRatio);
                    this.currentSegment.max_unique_ratio_proxy = Math.max(this.currentSegment.max_unique_ratio_proxy, metrics.unique_ratio);
                }
            }
        }
        // 3. Train Baseline (Hard Guard)
        // Train only if: Normal State AND Not Anomaly (Just detected) AND Not Anomaly End Block.
        const effectiveTrain = allowTrainBaseline
            && !blockAnomalous
            && (this.state === CHMState.NORMAL)
            && ((flags & BLOCK_FLAGS.ANOMALY_END) === 0);
        if (effectiveTrain) {
            const prevBaseline = this.baselineRatio;
            // EMA Update Ratio
            this.baselineRatio = (this.EMA_ALPHA * currentRatio) + ((1 - this.EMA_ALPHA) * this.baselineRatio);
            // Deviation: |Current - PrevBaseline|
            const dev = Math.abs(currentRatio - prevBaseline);
            this.baselineRatioDev = (this.EMA_ALPHA * dev) + ((1 - this.EMA_ALPHA) * this.baselineRatioDev);
            // EMA Update Proxy
            this.baselineUniqueRatioProxy = (this.EMA_ALPHA * metrics.unique_ratio) + ((1 - this.EMA_ALPHA) * this.baselineUniqueRatioProxy);
        }
        // 4. Update Worst Blocks
        this.updateWorstBlocks(blockIndex, currentRatio, metrics.unique_ratio, codecId);
        return {
            flags,
            healthTag,
            isAnomaly: blockAnomalous, // Return true if this block is part of anomaly (Start/Mid)
            inQuarantine: this.state === CHMState.QUARANTINE_ACTIVE, // Current state AFTER update (End -> Normal)
            reasonCode
        };
    }
    /**
     * Preview Check (Stateless deviation check)
     */
    checkAnomaly(payloadIn, payloadOut, metrics) {
        const safeOut = payloadOut > 0 ? payloadOut : 1;
        const r = payloadIn / safeOut;
        return this.detectAnomaly(r, metrics.unique_ratio).isAnomaly;
    }
    detectAnomaly(currentRatio, uniqueRatio) {
        const expectedRatio = this.state === CHMState.NORMAL ? this.baselineRatio : (this.frozenBaselineRatio || this.baselineRatio);
        const threshold = expectedRatio - (this.K_RATIO_DEV_TRIGGER * this.baselineRatioDev);
        const isRatioDrop = currentRatio < threshold;
        // Entropy Burst: High entropy (> 1.5x baseline) + LOW ratio (below expected)
        const isEntropyBurst = (uniqueRatio > (this.baselineUniqueRatioProxy * 1.5)) &&
            (uniqueRatio > 0.5) &&
            (currentRatio < expectedRatio);
        if (isRatioDrop)
            return { isAnomaly: true, reason: 'RATIO_DROP' };
        if (isEntropyBurst)
            return { isAnomaly: true, reason: 'ENTROPY_BURST' };
        return { isAnomaly: false, reason: '' };
    }
    getReport() {
        // Close any open segment
        if (this.currentSegment) {
            this.currentSegment.end_block_index = this.lastBlockIndexSeen; // Force close
            // Already pushed to array when created?
            // Yes: `this.anomalies.push(this.currentSegment);` in UPDATE
            // So we just update the reference.
            this.currentSegment = null;
        }
        return {
            schema_version: 1,
            run_id: this.runId,
            gics_version: '1.2',
            segments: this.anomalies,
            worst_blocks: this.worstBlocks
        };
    }
    updateWorstBlocks(blockIndex, ratio, uniqueRatio, codecId) {
        this.worstBlocks.push({ block_index: blockIndex, ratio, entropy: uniqueRatio, codec_id: codecId });
        this.worstBlocks.sort((a, b) => a.ratio - b.ratio); // Ascending (worst first)
        if (this.worstBlocks.length > 10) {
            this.worstBlocks = this.worstBlocks.slice(0, 10);
        }
    }
    getTotalBlocks() { return this.totalBlocks; }
    getState() { return this.state; }
}
