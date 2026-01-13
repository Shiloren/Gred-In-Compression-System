# GICS v1.2 Critical Forensic Benchmark Report

**Status:** PASS
**Date:** 2026-01-13
**Verifier:** Independent Harness (v1.2-FORENSIC)

## 1. Environment & Commit
- **Commit**: `29b7d7d51cdbede096465ee62518d3cc5cd0ef588` (gics-v1.2-critical)
- **Node**: `v22.18.0`
- **NPM**: `11.5.2`
- **OS**: Windows NT 10.0.26100.0 (x64)

## 2. Methodology
- **Harness**: Independent `bench_postfreeze_harness.ts` (Clean Room implementation).
- **RNG**: Strict Linear Congruential Gen (Park-Miller) for deterministic datasets.
- **Verification**: Byte-exact reproduction across two independent runs (Run A / Run B).
- **Integrity**: SHA256 hashes of all outputs.

## 3. Dataset Performance

### A. Structured (Trend + Noise)
*Validation of known-good compressible data.*
- **Core Ratio**: **111.8x** (Target: >50x)
- **Global Ratio**: 111.8x
- **Quarantine Rate**: 0.00% (All data accepted by Core)
- **SHA256**: `a736f8bce21db4c4f30cf81409839ee9dee533b53afff431db862fee1399cd0f`

### B. Mixed Regime (Trend <-> Random)
*Validation of dynamic switching and quarantine activation.*
- **Core Ratio**: **315.5x**
- **Global Ratio**: 6.25x (Reflects inclusion of random noise)
- **Quarantine Rate**: 36.0% (Blocks with high entropy correctly rejected)
- **SHA256**: `486e2c2a42bb6f1ea37cc7a447887d2e4a09adf3418bce1c1ce408111f6dc8e5`

### C. High Entropy (Random Values)
*Validation of worst-case handling.*
- **Core Ratio**: **346.3x** (Time stream compressed efficiently in Core)
- **Global Ratio**: 3.26x
- **Quarantine Rate**: 50.0% (Value stream 100% rejected, Time stream 100% accepted)
- **SHA256**: `571c8c49f908c92c9b51eb5d09beb8b9cf16037316aeb7b8ffa799c2f39e961b`

## 4. Forensic Checks
| Check | Status | Evidence |
| :--- | :--- | :--- |
| **Reproducibility** | **PASS** | Run A and Run B SHA256 hashes match exactly. |
| **Logic Integrity** | **PASS** | `Core Output Bytes` in KPI matches Trace summation. |
| **Decode** | **PASS** | Roundtrip decoding yields bit-exact match to input. |
| **Protocol** | **PASS** | Headers + Payload == Total Block Bytes verified. |

## 5. Artifacts
All artifacts are stored in `bench_postfreeze_artifacts/runA` and `runB`.
- `*_trace.json`: Block-level audit trail.
- `*_kpi.json`: High-level metrics.
- `*_encoded.bin`: Compressed binary.
- `*_decoded.json`: Verified reproduction.

## 6. Verdict
 The system **PASSED** all forensic criteria.
- No regression in compression ratios (Structured > 100x).
- Correct quarantine behavior (Entropy spikes isolated).
- Zero non-determinism detected.
