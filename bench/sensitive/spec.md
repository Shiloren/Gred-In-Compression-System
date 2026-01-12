# Ultra-Sensitive Benchmark Specification

## Experiment Family A: Chunk Size Sweep
**Goal**: Detect optimal and pathological chunk sizes.
**Procedure**:
1. Fix dataset: `TS_TREND_INT_LARGE`.
2. Iterate `chunk_size` in [256KB, 512KB, 1MB, 2MB, 4MB, 8MB, 16MB, 32MB, 64MB, 128MB].
3. Measure: `ratio_x`, `encode_ms`.

## Experiment Family B: Append Continuity Gradient
**Goal**: Detect whether continuity is exploited gradually.
**Procedure**:
1. Fix dataset schema/generator.
2. Append N chunks where N ∈ [1, 2, 4, 8, 16, 32, 64].
3. Measure: `cumulative_ratio_x`, `incremental_ms_per_MB`.

## Experiment Family C: Structural Perturbation
**Goal**: Identify sensitivity to structure.
**Procedure**:
1. Base dataset: `TS_TREND_INT` (100k).
2. Variants:
   - **Cardinality++**: Increase value domain.
   - **Volatility++**: Increase delta variance.
   - **Broken Monotonicity**: Inject timestamp regressions.
   - **Outliers**: 1% extreme values.
3. Measure: `ratio_x`, `encode_ms`.

## Experiment Family D: Field Isolation
**Goal**: Identify dominant cost dimensions.
**Procedure**:
1. Encode Timestamps Only.
2. Encode Values Only.
3. Encode Full (TS + Val).
4. Measure: `encode_ms`, `ratio_x`.

## Experiment Family E: Ordering & Shuffle
**Goal**: Detect reliance on ordering.
**Procedure**:
1. Ordered Dataset.
2. Shuffled 5%.
3. Shuffled 25%.
4. Shuffled 100%.
5. Measure: `ratio_x`, `encode_ms`.

## Experiment Family F: Micro-Repeatability
**Goal**: Detect non-determinism.
**Procedure**:
1. Run standard encode 20 times.
2. Compute CoV (Coefficient of Variation) for time and ratio.
