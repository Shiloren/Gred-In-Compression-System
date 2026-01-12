/**
 * GICS HeatClassifier - Market Heatmap Intelligence
 *
 * @module gics
 * @version 1.1.0
 * @status FROZEN - Canonical implementation
 * @see docs/GICS_V1.1_SPEC.md
 *
 * Calculates continuous HeatScore for items based on market dynamics.
 * Formula: HeatScore = (Volatility × 0.4) + (Demand × 0.4) + (ChangeFrequency × 0.2)
 *
 * @author Gred In Labs
 */
import type { Snapshot, HeatScoreResult } from './gics-types.js';
export interface HeatConfig {
    /** Weight for volatility component (default: 0.4) */
    volatilityWeight?: number;
    /** Weight for demand component (default: 0.4) */
    demandWeight?: number;
    /** Weight for change frequency component (default: 0.2) */
    frequencyWeight?: number;
}
export declare class HeatClassifier {
    private readonly volatilityWeight;
    private readonly demandWeight;
    private readonly frequencyWeight;
    constructor(config?: HeatConfig);
    /**
     * Calculate HeatScore for a single item given its price and quantity history
     *
     * @param itemId The item's ID
     * @param prices Array of prices across snapshots
     * @param quantities Array of quantities across snapshots
     * @returns HeatScoreResult with score and component breakdown
     */
    calculateItemHeat(itemId: number, prices: number[], quantities: number[]): HeatScoreResult;
    /**
     * Analyze all items in a block of snapshots
     *
     * @param snapshots Array of snapshots to analyze
     * @returns Map of itemId → HeatScoreResult
     */
    analyzeBlock(snapshots: Snapshot[]): Map<number, HeatScoreResult>;
    /**
     * Get average heat score for a block (useful for block-level classification)
     */
    getBlockAverageHeat(heatScores: Map<number, HeatScoreResult>): number;
    /**
     * Calculate price volatility using coefficient of variation (CV)
     * CV = stddev / mean, normalized to 0-1 range
     *
     * High volatility → high score
     */
    private calculateVolatility;
    /**
     * Calculate demand trend indicator
     * Rising quantities → higher score
     *
     * Uses linear regression slope, normalized to 0-1
     */
    private calculateDemand;
    /**
     * Calculate change frequency
     * % of snapshots where price changed from previous
     */
    private calculateChangeFrequency;
}
