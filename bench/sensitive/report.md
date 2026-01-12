# Ultra-Sensitive GICS Benchmark Report (Zero-Entropy Patch)
**Run ID**: sensitive-2026-01-12T14-05-45.352Z.json
**Date**: 2026-01-12T14:06:14.354Z

## Family A: Chunk Size Sweep
| Variant | Mode | CtxID | AppMode | Ratio (x) | p50 (ms) | p90 (ms) | Output (Bytes) | Δ Bytes (OFF-ON) |
|---|---|---|---|---|---|---|---|---|
| Size_1000 | OFF | NULL | n/a | 13.29 | 1.56 | 3.22 | 1421 | - |
| Size_1000 | ON | `ctx_1` | n/a | 12.20 | 0.80 | 1.09 | 1548 | - |
| **DELTA** | A/B | - | - | **-1.09** | -0.76 | - | -127 | **-127** |
| Size_5000 | OFF | NULL | n/a | 27.83 | 3.49 | 5.43 | 3553 | - |
| Size_5000 | ON | `ctx_2` | n/a | 25.16 | 2.43 | 3.64 | 3930 | - |
| **DELTA** | A/B | - | - | **-2.67** | -1.06 | - | -377 | **-377** |
| Size_10000 | OFF | NULL | n/a | 32.64 | 5.18 | 6.86 | 6218 | - |
| Size_10000 | ON | `ctx_3` | n/a | 30.20 | 5.51 | 6.73 | 6722 | - |
| **DELTA** | A/B | - | - | **-2.45** | +0.33 | - | -504 | **-504** |
| Size_50000 | OFF | NULL | n/a | 39.33 | 33.75 | 40.32 | 27538 | - |
| Size_50000 | ON | `ctx_4` | n/a | 38.11 | 35.65 | 42.85 | 28417 | - |
| **DELTA** | A/B | - | - | **-1.22** | +1.90 | - | -879 | **-879** |
| Size_100000 | OFF | NULL | n/a | 40.91 | 71.65 | 83.61 | 54188 | - |
| Size_100000 | ON | `ctx_5` | n/a | 40.17 | 69.69 | 82.83 | 55192 | - |
| **DELTA** | A/B | - | - | **-0.74** | -1.95 | - | -1004 | **-1004** |

## Family B: Append Continuity
| Variant | Mode | CtxID | AppMode | Ratio (x) | p50 (ms) | p90 (ms) | Output (Bytes) | Δ Bytes (OFF-ON) |
|---|---|---|---|---|---|---|---|---|
| Append_Seg_1 | OFF | NULL | segment | 32.62 | 6.13 | 7.59 | 6218 | - |
| Append_Seg_1 | ON | `ctx_6` | segment | 30.18 | 6.52 | 8.18 | 6722 | - |
| **DELTA** | A/B | - | - | **-2.45** | +0.39 | - | -504 | **-504** |
| Append_Cont_1 | OFF | NULL | continuous | 32.62 | 6.21 | 7.57 | 6218 | - |
| Append_Cont_1 | ON | `ctx_7` | continuous | 30.18 | 5.75 | 6.72 | 6722 | - |
| **DELTA** | A/B | - | - | **-2.45** | -0.46 | - | -504 | **-504** |
| Append_Seg_2 | OFF | NULL | segment | 32.61 | 13.17 | 13.39 | 12440 | - |
| Append_Seg_2 | ON | `ctx_8` | segment | 30.18 | 13.16 | 20.39 | 13444 | - |
| **DELTA** | A/B | - | - | **-2.44** | -0.01 | - | -1004 | **-1004** |
| Append_Cont_2 | OFF | NULL | continuous | 31.35 | 11.43 | 13.23 | 12940 | - |
| Append_Cont_2 | ON | `ctx_9` | continuous | 30.18 | 12.46 | 13.82 | 13444 | - |
| **DELTA** | A/B | - | - | **-1.18** | +1.04 | - | -504 | **-504** |
| Append_Seg_4 | OFF | NULL | segment | 32.60 | 23.04 | 25.23 | 24888 | - |
| Append_Seg_4 | ON | `ctx_10` | segment | 30.17 | 20.90 | 26.80 | 26890 | - |
| **DELTA** | A/B | - | - | **-2.43** | -2.14 | - | -2002 | **-2002** |
| Append_Cont_4 | OFF | NULL | continuous | 30.75 | 21.27 | 22.84 | 26384 | - |
| Append_Cont_4 | ON | `ctx_11` | continuous | 30.17 | 24.20 | 24.75 | 26890 | - |
| **DELTA** | A/B | - | - | **-0.58** | +2.93 | - | -506 | **-506** |
| Append_Seg_8 | OFF | NULL | segment | 32.60 | 43.49 | 46.48 | 49784 | - |
| Append_Seg_8 | ON | `ctx_12` | segment | 30.18 | 47.07 | 53.72 | 53778 | - |
| **DELTA** | A/B | - | - | **-2.42** | +3.58 | - | -3994 | **-3994** |
| Append_Cont_8 | OFF | NULL | continuous | 30.46 | 42.81 | 44.63 | 53272 | - |
| Append_Cont_8 | ON | `ctx_13` | continuous | 30.18 | 44.24 | 46.38 | 53778 | - |
| **DELTA** | A/B | - | - | **-0.29** | +1.43 | - | -506 | **-506** |
| Append_Seg_16 | OFF | NULL | segment | 32.59 | 87.02 | 88.85 | 99576 | - |
| Append_Seg_16 | ON | `ctx_14` | segment | 30.18 | 88.39 | 89.92 | 107554 | - |
| **DELTA** | A/B | - | - | **-2.42** | +1.37 | - | -7978 | **-7978** |
| Append_Cont_16 | OFF | NULL | continuous | 30.32 | 87.14 | 89.07 | 107048 | - |
| Append_Cont_16 | ON | `ctx_15` | continuous | 30.18 | 86.24 | 88.37 | 107554 | - |
| **DELTA** | A/B | - | - | **-0.14** | -0.90 | - | -506 | **-506** |

## Family C: Structural Perturbation
| Variant | Mode | CtxID | AppMode | Ratio (x) | p50 (ms) | p90 (ms) | Output (Bytes) | Δ Bytes (OFF-ON) |
|---|---|---|---|---|---|---|---|---|
| Base | OFF | NULL | n/a | 40.91 | 68.32 | 79.29 | 54188 | - |
| Base | ON | `ctx_16` | n/a | 40.17 | 81.40 | 86.64 | 55192 | - |
| **DELTA** | A/B | - | - | **-0.74** | +13.09 | - | -1004 | **-1004** |
| HighVolatility | OFF | NULL | n/a | 11.44 | 94.75 | 116.92 | 299162 | - |
| HighVolatility | ON | `ctx_17` | n/a | 11.44 | 88.86 | 106.60 | 299167 | - |
| **DELTA** | A/B | - | - | **-0.00** | -5.89 | - | -5 | **-5** |
| Outliers1Pct | OFF | NULL | n/a | 6.44 | 83.46 | 113.41 | 344688 | - |
| Outliers1Pct | ON | `ctx_18` | n/a | 6.44 | 84.69 | 113.91 | 344692 | - |
| **DELTA** | A/B | - | - | **-0.00** | +1.23 | - | -4 | **-4** |

## Family D: Field Isolation
| Variant | Mode | CtxID | AppMode | Ratio (x) | p50 (ms) | p90 (ms) | Output (Bytes) | Δ Bytes (OFF-ON) |
|---|---|---|---|---|---|---|---|---|
| TimeOnly | OFF | NULL | n/a | 405.37 | 65.86 | 77.94 | 4413 | - |
| TimeOnly | ON | `ctx_19` | n/a | 405.00 | 67.43 | 79.38 | 4417 | - |
| **DELTA** | A/B | - | - | **-0.37** | +1.57 | - | -4 | **-4** |
| ValueOnly | OFF | NULL | n/a | 40.91 | 82.61 | 106.22 | 54188 | - |
| ValueOnly | ON | `ctx_20` | n/a | 40.17 | 83.05 | 99.09 | 55192 | - |
| **DELTA** | A/B | - | - | **-0.74** | +0.44 | - | -1004 | **-1004** |
