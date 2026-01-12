# GICS Benchmark Report
**Run ID**: run-2026-01-12T11-48-53.520Z.json
**Time**: 2026-01-12T11:48:53.520Z
**Environment**: AMD Ryzen 5 5600G with Radeon Graphics          / Windows_NT 10.0.22631

## Results
| Dataset | System | Workload | Size (In) | Size (Out) | Ratio | Total (ms) | Setup (ms) | Encode (ms) | RAM (MB) |
|---|---|---|---|---|---|---|---|---|---|
| TS_TREND_INT | **GICS** | BENCH-ENC-001 | 2.13 MB | 0.09 MB | **22.52x** | 809 | 0.2 | 809.2 | 136.7 |
| TS_TREND_INT | **GICS** | BENCH-ENC-APPEND-001 | 10.66 MB | 0.48 MB | **22.22x** | 3331 | 0.0 | 3330.5 | 139.5 |
| TS_TREND_INT | **BASELINE_ZSTD** | BENCH-ENC-001 | 2.13 MB | 0.45 MB | **4.77x** | 29 | - | - | 141.7 |
| TS_VOLATILE_INT | **GICS** | BENCH-ENC-001 | 2.10 MB | 0.16 MB | **13.21x** | 928 | 0.0 | 927.6 | 146.5 |
| TS_VOLATILE_INT | **GICS** | BENCH-ENC-APPEND-001 | 10.51 MB | 0.80 MB | **13.12x** | 4477 | 0.0 | 4476.6 | 146.5 |
| TS_VOLATILE_INT | **BASELINE_ZSTD** | BENCH-ENC-001 | 2.10 MB | 0.47 MB | **4.48x** | 16 | - | - | 142.8 |
| TS_TREND_INT_LARGE | **GICS** | BENCH-ENC-001 | 48.00 MB | 1.93 MB | **24.82x** | 12419 | 0.0 | 12419.0 | 152.7 |
| TS_TREND_INT_LARGE | **GICS** | BENCH-ENC-APPEND-001 | 240.02 MB | 9.72 MB | **24.71x** | 73410 | 0.0 | 73410.0 | 205.8 |