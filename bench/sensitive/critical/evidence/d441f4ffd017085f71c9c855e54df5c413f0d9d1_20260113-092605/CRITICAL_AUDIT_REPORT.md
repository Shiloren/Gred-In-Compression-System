# Critical Assurance Audit Report

**Date:** 2026-01-13T09:26:25Z
**Commit:** d441f4ffd017085f71c9c855e54df5c413f0d9d1
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

\$(@{Algorithm=SHA256; Hash=A399EE4D518791E13D11746F752BA99A25C4CE723148FFAE8D3B1DEBD52DCF36; Path=C:\Users\shilo\Documents\GitHub\Gred-In-Compression-System\bench\sensitive\critical\evidence\gics_v1.2_critical_evidence_d441f4ffd017085f71c9c855e54df5c413f0d9d1_20260113-092605.zip}.Hash)\ (gics_v1.2_critical_evidence_d441f4ffd017085f71c9c855e54df5c413f0d9d1_20260113-092605.zip)
