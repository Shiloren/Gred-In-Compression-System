# Critical Assurance Audit Report

**Date:** 2026-01-13T09:29:47Z
**Commit:** 1f63de9660f5789c899a9e3c2b3bdc5c687cf487
**GICS Version:** 1.2 (Critical)
**Master Seed:** 8675309

## Executive Summary
The Critical Assurance Gate has executed 8 vectors.
Result: **FAIL**

## Runner Results
| Vector | Runner | Status | Duration (ms) | Log |
|---|---|---|---|---|| ENFORCEMENT | enforcement_runner | FAIL | 3341 | [log](logs/enforcement_runner.log) |
| INTEGRITY | integrity_runner | FAIL | 5905 | [log](logs/integrity_runner.log) |
| INTEGRITY | integrity_scope_verifier | FAIL | 2862 | [log](logs/integrity_scope_verifier.log) |
| CRASH | crash_runner | FAIL | 5941 | [log](logs/crash_runner.log) |
| CONCURRENCY | concurrency_runner | FAIL | 3053 | [log](logs/concurrency_runner.log) |
| RESOURCE | resource_runner | FAIL | 2229 | [log](logs/resource_runner.log) |
| FUZZ | fuzz_runner | FAIL | 3815 | [log](logs/fuzz_runner.log) |
| ERROR | error_discipline | FAIL | 2678 | [log](logs/error_discipline.log) |

## Configuration Snaphot
- **Hard Limits:** MAX_BLOCK_ITEMS=10000, MAX_RLE_RUN=2000
- **Integrity Scope:** Structural Validity Checked.
- **Protocol:** v1.2 + EOS Required.

## Evidence checksums
See \checksums.sha256\ in the zip bundle.
## Bundle Checksum

\$(@{Algorithm=SHA256; Hash=AF26F3928C9B1A9FF7D8648A82B28EF5464C2E0679352D9BF8C8ECA90D86A863; Path=C:\Users\shilo\Documents\GitHub\Gred-In-Compression-System\bench\sensitive\critical\evidence\gics_v1.2_critical_evidence_1f63de9660f5789c899a9e3c2b3bdc5c687cf487_20260113-092917.zip}.Hash)\ (gics_v1.2_critical_evidence_1f63de9660f5789c899a9e3c2b3bdc5c687cf487_20260113-092917.zip)
