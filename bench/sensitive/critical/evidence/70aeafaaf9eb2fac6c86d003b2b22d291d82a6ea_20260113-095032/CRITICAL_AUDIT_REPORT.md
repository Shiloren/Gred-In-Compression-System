# Critical Assurance Audit Report

**Date:** 2026-01-13T09:52:30Z
**Commit:** 70aeafaaf9eb2fac6c86d003b2b22d291d82a6ea
**GICS Version:** 1.2 (Critical)
**Master Seed:** 8675309

## Executive Summary
The Critical Assurance Gate has executed 8 vectors.
Result: **FAIL**

## Runner Results
| Vector | Runner | Status | Duration (ms) | Log |
|---|---|---|---|---|| ENFORCEMENT | enforcement_runner | FAIL | 2866 | [log](logs/enforcement_runner.log) |
| INTEGRITY | integrity_runner | FAIL | 4943 | [log](logs/integrity_runner.log) |
| INTEGRITY | integrity_scope_verifier | FAIL | 2437 | [log](logs/integrity_scope_verifier.log) |
| CRASH | crash_runner | FAIL | 77282 | [log](logs/crash_runner.log) |
| CONCURRENCY | concurrency_runner | PASS | 2514 | [log](logs/concurrency_runner.log) |
| RESOURCE | resource_runner | FAIL | 3058 | [log](logs/resource_runner.log) |
| FUZZ | fuzz_runner | PASS | 23032 | [log](logs/fuzz_runner.log) |
| ERROR | error_discipline | FAIL | 1884 | [log](logs/error_discipline.log) |

## Configuration Snaphot
- **Hard Limits:** MAX_BLOCK_ITEMS=10000, MAX_RLE_RUN=2000
- **Integrity Scope:** Structural Validity Checked.
- **Protocol:** v1.2 + EOS Required.

## Evidence checksums
See \checksums.sha256\ in the zip bundle.
## Bundle Checksum

\$(@{Algorithm=SHA256; Hash=2F8584CACE12FA634274359549E2A8BF37A3333BFA4BA9A91750B7892F3B2C2A; Path=C:\Users\shilo\Documents\GitHub\Gred-In-Compression-System\bench\sensitive\critical\evidence\gics_v1.2_critical_evidence_70aeafaaf9eb2fac6c86d003b2b22d291d82a6ea_20260113-095032.zip}.Hash)\ (gics_v1.2_critical_evidence_70aeafaaf9eb2fac6c86d003b2b22d291d82a6ea_20260113-095032.zip)
