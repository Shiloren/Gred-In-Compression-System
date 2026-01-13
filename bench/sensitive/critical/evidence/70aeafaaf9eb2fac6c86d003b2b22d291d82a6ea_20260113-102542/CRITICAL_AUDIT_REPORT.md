# Critical Assurance Audit Report

**Date:** 2026-01-13T10:27:48Z
**Commit:** 70aeafaaf9eb2fac6c86d003b2b22d291d82a6ea
**GICS Version:** 1.2 (Critical)
**Master Seed:** 8675309

## Executive Summary
The Critical Assurance Gate has executed 8 vectors.
Result: **FAIL**

## Runner Results
| Vector | Runner | Status | Duration (ms) | Log |
|---|---|---|---|---|| ENFORCEMENT | enforcement_runner | PASS | 2796 | [log](logs/enforcement_runner.log) |
| INTEGRITY | integrity_runner | PASS | 16103 | [log](logs/integrity_runner.log) |
| INTEGRITY | integrity_scope_verifier | PASS | 2337 | [log](logs/integrity_scope_verifier.log) |
| CRASH | crash_runner | PASS | 77156 | [log](logs/crash_runner.log) |
| CONCURRENCY | concurrency_runner | PASS | 1885 | [log](logs/concurrency_runner.log) |
| RESOURCE | resource_runner | FAIL | 1838 | [log](logs/resource_runner.log) |
| FUZZ | fuzz_runner | PASS | 21892 | [log](logs/fuzz_runner.log) |
| ERROR | error_discipline | PASS | 1818 | [log](logs/error_discipline.log) |

## Configuration Snaphot
- **Hard Limits:** MAX_BLOCK_ITEMS=10000, MAX_RLE_RUN=2000
- **Integrity Scope:** Structural Validity Checked.
- **Protocol:** v1.2 + EOS Required.

## Evidence checksums
See \checksums.sha256\ in the zip bundle.
## Bundle Checksum

\$(@{Algorithm=SHA256; Hash=EF82FE5FB18510CF355249CB1E3CFBC77D747066FEF48F6240D1A59CA2B46A5E; Path=C:\Users\shilo\Documents\GitHub\Gred-In-Compression-System\bench\sensitive\critical\evidence\gics_v1.2_critical_evidence_70aeafaaf9eb2fac6c86d003b2b22d291d82a6ea_20260113-102542.zip}.Hash)\ (gics_v1.2_critical_evidence_70aeafaaf9eb2fac6c86d003b2b22d291d82a6ea_20260113-102542.zip)
