
export enum Regime {
    ORDERED = 'ORDERED', // Low entropy, highly predictable
    MIXED = 'MIXED',     // Moderate entropy
    CHAOTIC = 'CHAOTIC'  // High entropy, random
}

export interface BlockMetrics {
    unique_ratio: number;
    zero_ratio: number;
    mean_abs_delta: number;
    p90_abs_delta: number;
    sign_flip_rate: number;
    monotonicity_score: number;
    outlier_score: number;
    // Split-5.2 Delta-Aware Metrics
    unique_delta_ratio: number;
    unique_dod_ratio: number;
    dod_zero_ratio: number;
    mean_abs_dod: number;
    p90_abs_dod: number;
}

const EMPTY_METRICS: BlockMetrics = {
    unique_ratio: 0,
    zero_ratio: 0,
    mean_abs_delta: 0,
    p90_abs_delta: 0,
    sign_flip_rate: 0,
    monotonicity_score: 1,
    outlier_score: 0,
    unique_delta_ratio: 0,
    unique_dod_ratio: 0,
    dod_zero_ratio: 1,
    mean_abs_dod: 0,
    p90_abs_dod: 0
};

interface DeltaStats {
    deltas: number[];
    sumAbsDelta: number;
    signFlips: number;
    increasingCount: number;
    decreasingCount: number;
}

function computeDeltas(values: number[]): DeltaStats {
    const deltas: number[] = [];
    let sumAbsDelta = 0;
    let signFlips = 0;
    let increasingCount = 0;
    let decreasingCount = 0;

    for (let i = 1; i < values.length; i++) {
        const d = values[i] - values[i - 1];
        deltas.push(d);
        sumAbsDelta += Math.abs(d);

        if (i > 1) {
            const prevD = deltas[deltas.length - 2];
            if ((d > 0 && prevD < 0) || (d < 0 && prevD > 0)) {
                signFlips++;
            }
        }
        if (d >= 0) increasingCount++;
        if (d <= 0) decreasingCount++;
    }

    return { deltas, sumAbsDelta, signFlips, increasingCount, decreasingCount };
}

function computeDeltaOfDeltas(deltas: number[]): { dods: number[]; sumAbsDod: number; zeroDodCount: number } {
    const dods: number[] = [];
    let sumAbsDod = 0;
    let zeroDodCount = 0;

    for (let i = 1; i < deltas.length; i++) {
        const dd = deltas[i] - deltas[i - 1];
        dods.push(dd);
        sumAbsDod += Math.abs(dd);
        if (dd === 0) zeroDodCount++;
    }

    return { dods, sumAbsDod, zeroDodCount };
}

function computeP90(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = arr.map(Math.abs).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.9)];
}

function computeOutlierScore(sortedAbsDeltas: number[], meanAbsDelta: number, deltaCount: number): number {
    if (deltaCount === 0) return 0;
    const threshold = meanAbsDelta * 5;
    if (threshold <= 0) return 0;
    let outliers = 0;
    for (const ad of sortedAbsDeltas) {
        if (ad > threshold) outliers++;
    }
    return outliers / deltaCount;
}

/**
 * Deterministic Metric Calculation
 * @param values Raw values (integers)
 */
export function calculateBlockMetrics(values: number[]): BlockMetrics {
    if (values.length === 0) return { ...EMPTY_METRICS };

    const unique_ratio = new Set(values).size / values.length;
    const zero_ratio = values.filter(v => v === 0).length / values.length;

    const ds = computeDeltas(values);
    const { dods, sumAbsDod, zeroDodCount } = computeDeltaOfDeltas(ds.deltas);

    const mean_abs_delta = ds.deltas.length > 0 ? ds.sumAbsDelta / ds.deltas.length : 0;
    const sign_flip_rate = ds.deltas.length > 1 ? ds.signFlips / (ds.deltas.length - 1) : 0;
    const monotonicity_score = ds.deltas.length > 0
        ? Math.max(ds.increasingCount, ds.decreasingCount) / ds.deltas.length
        : 1;

    const unique_delta_ratio = ds.deltas.length > 0 ? new Set(ds.deltas).size / ds.deltas.length : 0;

    const mean_abs_dod = dods.length > 0 ? sumAbsDod / dods.length : 0;
    const dod_zero_ratio = dods.length > 0 ? zeroDodCount / dods.length : 0;
    const unique_dod_ratio = dods.length > 0 ? new Set(dods).size / dods.length : 0;

    const sortedAbsDeltas = ds.deltas.map(Math.abs).sort((a, b) => a - b);

    return {
        unique_ratio,
        zero_ratio,
        mean_abs_delta,
        p90_abs_delta: computeP90(ds.deltas),
        sign_flip_rate,
        monotonicity_score,
        outlier_score: computeOutlierScore(sortedAbsDeltas, mean_abs_delta, ds.deltas.length),
        unique_delta_ratio,
        unique_dod_ratio,
        dod_zero_ratio,
        mean_abs_dod,
        p90_abs_dod: computeP90(dods)
    };
}

/**
 * Classify Regime
 */
export function classifyRegime(metrics: BlockMetrics): Regime {
    if (metrics.monotonicity_score > 0.9 || metrics.unique_ratio < 0.05) {
        return Regime.ORDERED;
    }
    if (metrics.sign_flip_rate > 0.4 && metrics.unique_ratio > 0.8) {
        return Regime.CHAOTIC;
    }
    if (metrics.outlier_score > 0.1) {
        return Regime.CHAOTIC;
    }
    return Regime.MIXED;
}
