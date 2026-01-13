# GICS v1.2 Canonical Snapshot (FROZEN)

**Frozen Date**: 2026-01-13
**Version**: 1.2.0-canonical (Multi-Item Fix)
**Verified Hash**: `a3701a820fa843fc0c269aa76303f16fdbe916aecd640c88dff0d965a9c53812`

## Purpose
This directory contains the immutable source code for GICS v1.2 with critical fixes for:
1.  **Multi-Item Support** (Critical for WoW Snapshots)
2.  **Determinism** (Sorted Map Iteration)
3.  **Fail-Closed Integrity** (EOS Marker)

## Verification
This snapshot is sealed by `tests/gics-v1.2-golden.test.ts`. Any change to logic in these files will break the Golden Hash.

## Contents
- `encode.ts`: Multi-stream encoder (TIME, VALUE, ITEM_ID, QUANTITY, SNAPSHOT_LEN)
- `decode.ts`: Generic multi-item decoder
- `format.ts`: Stream definitions and EOS marker
- `chm.ts`, `metrics.ts`, `codecs.ts`, `context.ts`: Supporting logic
