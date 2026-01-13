# Critical Assurance Audit Report

**Date:** 2026-01-13T09:24:33Z
**Commit:** 440341fb028574004bce40b1d8c71dd040ed27c0
**GICS Version:** 1.2 (Critical)
**Master Seed:** 8675309

## Executive Summary
The Critical Assurance Gate has executed 8 vectors.
Result: **FAIL**

## Runner Results
| Vector | Runner | Status | Duration (ms) | Log |
|---|---|---|---|---|| ENFORCEMENT | enforcement_runner | CRASH | 0 | [log](logs/enforcement_runner.log) |
| INTEGRITY | integrity_runner | CRASH | 0 | [log](logs/integrity_runner.log) |
| INTEGRITY | integrity_scope_verifier | CRASH | 0 | [log](logs/integrity_scope_verifier.log) |
| CRASH | crash_runner | CRASH | 0 | [log](logs/crash_runner.log) |
| CONCURRENCY | concurrency_runner | CRASH | 0 | [log](logs/concurrency_runner.log) |
| RESOURCE | resource_runner | CRASH | 0 | [log](logs/resource_runner.log) |
| FUZZ | fuzz_runner | CRASH | 0 | [log](logs/fuzz_runner.log) |
| ERROR | error_discipline | CRASH | 0 | [log](logs/error_discipline.log) |

## Configuration Snaphot
- **Hard Limits:** MAX_BLOCK_ITEMS=10000, MAX_RLE_RUN=2000
- **Integrity Scope:** Structural Validity Checked.
- **Protocol:** v1.2 + EOS Required.

## Evidence checksums
See \checksums.sha256\ in the zip bundle.
## Bundle Checksum

\$(@{Algorithm=SHA256; Hash=329ABB11060D23341CF94B4E2C55AB9A0A96CA5EBFE7171B3547A69F2616A288; Path=C:\Users\shilo\Documents\GitHub\Gred-In-Compression-System\bench\sensitive\critical\evidence\gics_v1.2_critical_evidence_440341fb028574004bce40b1d8c71dd040ed27c0_20260113-092412.zip}.Hash)\ (gics_v1.2_critical_evidence_440341fb028574004bce40b1d8c71dd040ed27c0_20260113-092412.zip)
