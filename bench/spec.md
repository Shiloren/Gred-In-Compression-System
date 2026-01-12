# GICS Benchmark Specification

## Datasets

| ID | Name | Description | Generator Params |
|---|---|---|---|
| DS-01 | **TS_TREND_INT** | Monotonic timestamps, slowly changing integer values. High compressibility. | Rows: 100k, Start: 0, Step: ±1-5 |
| DS-01-L | **TS_TREND_INT_LARGE** | Large scale version of Trend Int. | Rows: 5M, ~125MB Raw |
| DS-02 | **TS_VOLATILE_INT** | Integer values with moderate volatility and noise. | Rows: 1M, Volatility: High |
| DS-03 | **TS_ADVERSARIAL_INT** | High-entropy integer stream (Pseudo-random). | Rows: 1M, Entropy: Max |
| DS-04 | **EVENT_LOG_STRUCT** | Repeated keys, moderate cardinality strings. | Rows: 100k, Structure: Log Lines |
| DS-05 | **STRUCT_KV_TREE** | Nested objects, incremental diffs. | Rows: 50k, Depth: 4 |

## Workloads

### BENCH-ENC-001: Encode Only
- **Goal**: Measure raw ingestion and compression speed.
- **Procedure**:
  1. Generate dataset in memory.
  2. Start Component/Writer.
  3. Feed all data.
  4. Flush/Finish.
  5. Measure wall time and peak RAM.

### BENCH-DEC-001: Decode Only
- **Goal**: Measure decompression and reconstruction speed.
- **Procedure**:
  1. Load compressed verification artifact.
  2. Decode to memory.
  3. Validate integrity.

### BENCH-ENC-APPEND-001: Append Amortization
- **Goal**: Measure performance when appending chunks to an existing writer (amortizing setup).
- **Procedure**:
  1. Initialize Writer.
  2. Split dataset into 10 equal chunks.
  3. Append chunks sequentially.
  4. Measure total time and throughput.

## Limitations
- **Cold Cache**: True cold cache requires OS-level flushes/reboots. We simulate "cold-ish" by spawning new processes, but OS file cache may persist.
- **Memory Measurement**: Uses `process.memoryUsage()`, which includes V8 overhead. Comparisons should be relative.
