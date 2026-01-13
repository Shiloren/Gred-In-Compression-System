export declare enum Regime {
    ORDERED = "ORDERED",// Low entropy, highly predictable
    MIXED = "MIXED",// Moderate entropy
    CHAOTIC = "CHAOTIC"
}
export interface BlockMetrics {
    unique_ratio: number;
    zero_ratio: number;
    mean_abs_delta: number;
    p90_abs_delta: number;
    sign_flip_rate: number;
    monotonicity_score: number;
    outlier_score: number;
    unique_delta_ratio: number;
    unique_dod_ratio: number;
    dod_zero_ratio: number;
    mean_abs_dod: number;
    p90_abs_dod: number;
}
/**
 * Deterministic Metric Calculation
 * @param values Raw values (integers)
 */
export declare function calculateBlockMetrics(values: number[]): BlockMetrics;
/**
 * Classify Regime
 */
export declare function classifyRegime(metrics: BlockMetrics): Regime;
