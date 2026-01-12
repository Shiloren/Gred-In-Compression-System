# GICS Frozen Snapshot v1.1.0

This directory contains the immutable snapshot of GICS v1.1.
It is frozen to ensure stability while v1.2 development continues in the main `src/` directory.

## Contents
- **Canonical Source**: Exact copy of v1.1 implementation.
- **Frozen API**: `v1_1_0/index.ts` exposing `gics11_encode` and `gics11_decode`.

## Usage

### 1. Verification (Golden Tests)
A dedicated test suite ensures this snapshot remains bit-exact identical forever.
```bash
npm test tests/gics-v1.1-golden.test.ts
```

### 2. Rollback / Version Switching
The active system API in `src/` has been instrumented to respect the `GICS_VERSION` environment variable.

**To Force v1.1 (Rollback/Safety Mode):**
Set the environment variable `GICS_VERSION` to `1.1`.
- **Linux/Mac:** `export GICS_VERSION="1.1"`
- **Windows (PowerShell):** `$env:GICS_VERSION="1.1"`

When set, `gics_encode` and `gics_decode` in the main application will transparently route to this frozen implementation.

### 3. Direct Import
You can also import this version directly if needed:
### 3. Direct Import
You can also import this version directly if needed:
`import { gics11_encode, gics11_decode } from 'gics_frozen/v1_1_0/index.js';`

## Maintenance
**DO NOT EDIT FILES IN THIS DIRECTORY.**
Any changes here will violate the immutability guarantee and fail the golden tests.
