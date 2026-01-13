# Critical Assurance Audit Report

**Date:** 2026-01-13T09:47:20Z
**Commit:** d5ecfee068ac14b3fc803ec22169e60972879d47
**GICS Version:** 1.2 (Critical)
**Master Seed:** 8675309

## Executive Summary
The Critical Assurance Gate has executed 8 vectors.
Result: **FAIL**

## Runner Results
| Vector | Runner | Status | Duration (ms) | Log |
|---|---|---|---|---|| ENFORCEMENT | enforcement_runner | FAIL | 2733 | [log](logs/enforcement_runner.log) |
| INTEGRITY | integrity_runner | FAIL | 5727 | [log](logs/integrity_runner.log) |
| INTEGRITY | integrity_scope_verifier | FAIL | 3123 | [log](logs/integrity_scope_verifier.log) |
| CRASH | crash_runner | FAIL | 4413 | [log](logs/crash_runner.log) |
| CONCURRENCY | concurrency_runner | PASS | 1923 | [log](logs/concurrency_runner.log) |
| RESOURCE | resource_runner | FAIL | 1770 | [log](logs/resource_runner.log) |
| FUZZ | fuzz_runner | FAIL | 4380 | [log](logs/fuzz_runner.log) |
| ERROR | error_discipline | FAIL | 2088 | [log](logs/error_discipline.log) |

## Configuration Snaphot
- **Hard Limits:** MAX_BLOCK_ITEMS=10000, MAX_RLE_RUN=2000
- **Integrity Scope:** Structural Validity Checked.
- **Protocol:** v1.2 + EOS Required.

## Evidence checksums
See \checksums.sha256\ in the zip bundle.
## Bundle Checksum

\$(@{Algorithm=SHA256; Hash=57E364025730F99C56C44DC76600A3FD5459671798B54228A224CB85917CD79F; Path=C:\Users\shilo\Documents\GitHub\Gred-In-Compression-System\bench\sensitive\critical\evidence\gics_v1.2_critical_evidence_d5ecfee068ac14b3fc803ec22169e60972879d47_20260113-094654.zip}.Hash)\ (gics_v1.2_critical_evidence_d5ecfee068ac14b3fc803ec22169e60972879d47_20260113-094654.zip)
