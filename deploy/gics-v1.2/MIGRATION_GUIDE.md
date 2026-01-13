# GICS v1.2 MIGRATION GUIDE

**Authorized By:** Antigravity (Google Deepmind)
**Target:** Recipient AI (Gred in Labs)
**Version:** 1.2.0 (Split-5)

## Overview

This bundle contains the **GICS v1.2 Agnostic Compression Engine**. It supersedes all previous "Hybrid" versions.

### Key Capabilities
-   **Dual-Stream Routing:** Separates `CORE` (High-efficiency) from `QUARANTINE` (High-fidelity) based on real-time entropy metrics.
-   **Compression Health Monitor (CHM):** Integrated quality gate ensuring >50x compression ratio for Core streams.
-   **Agnostic Ingest:** Accepts purely numeric Time/Value streams. Domain semantics (WoW, Gaming) must be adapted BEFORE ingestion.
-   **Self-Healing:** Detects regime shifts (Trend -> Stochastic) and isolates anomalies.

### Directory Structure
-   `src/index.ts` -> **Main Entry Point**.
-   `src/gics/v1_2/` -> **The v1.2 Core**.
-   `src/gics_frozen/v1_1_0/` -> **Immutable v1.1 Snapshot** (for fallback).
-   `src/gics-types.ts` -> **Shared Types**.

## Integration Instructions

1.  **Placement**:
    Place this folder in your repository (e.g., `src/libs/gics-v1.2` or `packages/gics`).

2.  **Dependencies**:
    -   Runtime: Node.js (Crypto API) or Browser (SubtleCrypto).
    -   Packages: `fs`, `path` (Node built-ins).

3.  **Rewiring**:
    Point your application's import to `src/index.ts`.

    ```typescript
    // OLD
    // import { HybridWriter } from './gics/gics-hybrid.js';
    
    // NEW
    import { gics_encode, gics_decode } from './libs/gics/src/index.js';
    
    // Usage
    const data = await gics_encode(snapshots);
    const result = await gics_decode(data);
    ```

4.  **Version Control**:
    The system supports a `GICS_VERSION` environment variable.
    -   `export GICS_VERSION="1.1"` -> Forces legacy behavior (using the frozen v1.1 module).
    -   `export GICS_VERSION="1.2"` -> (Default) Uses the new Agnostic Engine.

## Critical Notes for the AI

> [!IMPORTANT]
> **Type Safety**: The engine is strict. `gics_encode` expects `Snapshot[]`. If you have `GicsFrame` or raw arrays, verify if you need to fetch the `adapters/` (included but optional) or stick to the `Snapshot` interface.

> [!WARNING]
> **Legacy Wrapper**: A file named `legacy-wrapper.ts` may exist but is deprecated. Do not use it. Use the exports from `index.ts`.

> [!TIP]
> **Verification**: Run the included (if any) or existing `basic-test.ts` to verify the v1.2 engine initializes correctly in your environment.

**End of Transmission.**
