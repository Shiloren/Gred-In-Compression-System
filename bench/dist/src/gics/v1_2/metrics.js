export var Regime;
(function (Regime) {
    Regime["ORDERED"] = "ORDERED";
    Regime["MIXED"] = "MIXED";
    Regime["CHAOTIC"] = "CHAOTIC"; // High entropy, random
})(Regime || (Regime = {}));
/**
 * Deterministic Metric Calculation
 * @param values Raw values (integers)
 */
export function calculateBlockMetrics(values) {
    if (values.length === 0) {
        return {
            unique_ratio: 0,
            zero_ratio: 0,
            mean_abs_delta: 0,
            p90_abs_delta: 0,
            sign_flip_rate: 0,
            monotonicity_score: 1,
            outlier_score: 0
        };
    }
    const set = new Set(values);
    const unique_ratio = set.size / values.length;
    let zeroCount = 0;
    let sumAbsDelta = 0;
    let signFlips = 0;
    let increasingCount = 0;
    let decreasingCount = 0;
    // Compute Deltas for analysis (basic delta from previous item)
    // We assume the sequence is a stream (e.g. Times or Values)
    // Metrics are usually calculated on the RAW data to decide how to encode.
    // Spec says: "metrics per block"
    // Outlier detection requires Mean/StdDev or IQR roughly.
    // For deterministic "score", we can use median logic or just simple distance from mean.
    const deltas = [];
    for (let i = 1; i < values.length; i++) {
        const d = values[i] - values[i - 1];
        deltas.push(d);
        if (d === 0)
            zeroCount++; // Zero delta means repeated value
        sumAbsDelta += Math.abs(d);
        if (i > 1) {
            const prevD = deltas[deltas.length - 2];
            // Sign flip: positive to negative or vice versa (ignoring zeros?)
            // Strict sign flip:
            if ((d > 0 && prevD < 0) || (d < 0 && prevD > 0)) {
                signFlips++;
            }
        }
        if (d >= 0)
            increasingCount++;
        if (d <= 0)
            decreasingCount++;
    }
    // Zero Ratio interpretation:
    // User says "zero_ratio". Usually refers to raw zeros OR zero deltas? 
    // Spec says "unique_ratio, zero_ratio, mean_abs_delta".
    // Usually "zero_ratio" on raw values (sparsity).
    // Let's implement BOTH raw zeros and delta zeros? 
    // Spec just says "zero_ratio". I'll use Raw Values Zero Ratio for now as it's common for RLE.
    let rawZeroCount = 0;
    for (const v of values) {
        if (v === 0)
            rawZeroCount++;
    }
    const zero_ratio = rawZeroCount / values.length;
    const mean_abs_delta = deltas.length > 0 ? sumAbsDelta / deltas.length : 0;
    const sign_flip_rate = deltas.length > 1 ? signFlips / (deltas.length - 1) : 0;
    // Monotonicity: max(increasing, decreasing) / length
    const monotonicity_score = deltas.length > 0
        ? Math.max(increasingCount, decreasingCount) / deltas.length
        : 1;
    // P90 Delta
    // Deterministic sort
    const sortedAbsDeltas = deltas.map(Math.abs).sort((a, b) => a - b);
    const p90index = Math.floor(sortedAbsDeltas.length * 0.9);
    const p90_abs_delta = sortedAbsDeltas.length > 0 ? sortedAbsDeltas[p90index] : 0;
    // Outlier Score (Simple robust version)
    // Fraction of deltas > 3 * p90? Or > 5 * mean?
    // Let's use: count(abs_delta > 5 * mean_abs_delta) / length
    let outliers = 0;
    const threshold = mean_abs_delta * 5;
    if (threshold > 0) {
        for (const ad of sortedAbsDeltas) {
            if (ad > threshold)
                outliers++;
        }
    }
    const outlier_score = deltas.length > 0 ? outliers / deltas.length : 0;
    return {
        unique_ratio,
        zero_ratio,
        mean_abs_delta,
        p90_abs_delta,
        sign_flip_rate,
        monotonicity_score,
        outlier_score
    };
}
/**
 * Classify Regime
 */
export function classifyRegime(metrics) {
    // Deterministic Rules
    // 1. ORDERED
    // High monotonicity OR very low unique ratio (constants) OR very low mean delta
    if (metrics.monotonicity_score > 0.9 || metrics.unique_ratio < 0.05) {
        return Regime.ORDERED;
    }
    // 2. CHAOTIC
    // High sign flips AND high entropy (unique ratio)
    if (metrics.sign_flip_rate > 0.4 && metrics.unique_ratio > 0.8) {
        return Regime.CHAOTIC;
    }
    // High Outliers -> Chaotic handling usually
    if (metrics.outlier_score > 0.1) {
        return Regime.CHAOTIC;
    }
    // 3. MIXED (Default)
    return Regime.MIXED;
}
