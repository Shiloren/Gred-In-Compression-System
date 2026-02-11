# GICS Benchmark Suite

This directory contains two complementary benchmark paths:

1. **Exploratory harness** (`bench/scripts/harness.ts`) for iterative performance analysis.
2. **Empirical fail-state gate** (`bench/scripts/empirical.ts`) for objective acceptance checks.

---

## Fail-State Contract (Hard Gate)

The empirical benchmark is considered **PASS** only if all the following are true:

1. **Critical weighted compression ratio (GICS) >= 50x**
2. **Integrity validation is 100%** on all critical datasets
3. No benchmark runtime error occurred

If any condition fails, the process exits non-zero and CI must fail.

> Threshold can be overridden with `GICS_MIN_RATIO_X` (default `50`).

---

## Usage

### 1) Hard gate (recommended for release/CI)

```bash
npm run bench:gate
```

Outputs:
- `bench/results/latest/empirical-report.json`
- `bench/results/latest/empirical-report.md`
- `bench/results/empirical-<timestamp>.json`

### 2) Empirical run (same engine, local analysis)

```bash
npm run bench:empirical
```

### 2.b) Strict empirical audit (A/B/C, protobuf+msgpack+arrow+structured-binary)

```bash
npm run bench:strict
```

Outputs:
- `bench/results/latest/empirical-strict-report.json`
- `bench/results/latest/empirical-strict-report.txt`
- `bench/results/empirical-strict-<timestamp>.json`

### 3) Legacy exploratory benchmark + report

```bash
npm run bench
```

Or:

```powershell
./bench/scripts/run-all.ps1
```

---

## Reproducibility Contract

1. **Deterministic inputs** where seeded generation is used.
2. **Environment recorded** (OS/CPU/Node/git commit in empirical report).
3. **Structured output** (JSON + Markdown) for auditability.
4. **Integrity checked** for GICS and baseline decode flow.

---

## Structure

- `scripts/`: benchmark engines, datasets, comparators, reporting.
- `results/`: machine-generated outputs and latest artifacts.
- `spec.md`: benchmark scenario notes.
