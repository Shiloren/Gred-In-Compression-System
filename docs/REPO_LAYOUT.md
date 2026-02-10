# Repository Layout

> Project structure overview for the GICS core repository (v1.3).

---

## Directory Structure

```
/
├── src/                    # Production source code
│   ├── gics/               # Core v1.3 engine
│   │   ├── encode.ts       # Encoder (legacy + schema paths)
│   │   ├── decode.ts       # Decoder (legacy + schema + query)
│   │   ├── format.ts       # Binary format constants and enums
│   │   ├── codecs.ts       # Inner codecs (BitPack, RLE, Dict, Fixed64)
│   │   ├── context.ts      # Coding context (dictionary, state snapshot/restore)
│   │   ├── chm.ts          # Compression Health Monitor (anomaly detection)
│   │   ├── metrics.ts      # Block metrics calculation + regime classification
│   │   ├── segment.ts      # Segment, SegmentIndex, BloomFilter, SegmentBuilder
│   │   ├── stream-section.ts # StreamSection serialization
│   │   ├── string-dict.ts  # String dictionary for schema string IDs
│   │   ├── integrity.ts    # SHA-256 hash chain + CRC32
│   │   ├── encryption.ts   # AES-256-GCM encryption/decryption
│   │   ├── outer-codecs.ts # Zstd compression wrapper
│   │   ├── field-math.ts   # Delta/DOD computation for time and value streams
│   │   ├── file-access.ts  # File append utilities
│   │   ├── errors.ts       # Error hierarchy (IntegrityError, etc.)
│   │   ├── types.ts        # Encoder/Decoder option types
│   │   └── telemetry-types.ts # BlockStats type
│   ├── gics-types.ts       # Global type definitions (Snapshot, SchemaProfile, etc.)
│   ├── gics-utils.ts       # Low-level varint/RLE utilities
│   ├── zstd-codec.d.ts     # Type declaration for zstd-codec
│   └── index.ts            # Public API (GICS namespace + exports)
│
├── tests/                  # Vitest test suites (101 tests)
│   ├── gics-*.test.ts      # Unit/Integration tests
│   ├── regression/         # Regression tests (EOS, integrity, truncation)
│   ├── fixtures/golden/    # Golden corpus (.gics + .expected.json)
│   └── helpers/            # Test utilities
│
├── bench/                  # Performance benchmarks
│   ├── scripts/            # Harness, datasets, report generation
│   ├── forensics/          # Determinism verification pipeline
│   └── results/            # Benchmark run artifacts
│
├── tools/                  # Development utilities
│   ├── golden/             # Golden corpus generator
│   └── verify/             # Standalone integrity verifier
│
├── docs/                   # Documentation
│   ├── API.md              # Public API reference + integration guide
│   ├── FORMAT.md           # Binary wire format specification
│   ├── SECURITY_MODEL.md   # Encryption, integrity, threat model
│   ├── VERSIONING.md       # Version history and archive pointers
│   ├── REPO_LAYOUT.md      # This file
│   ├── ARCHIVE_POINTERS.md # Checksums for archived versions
│   ├── AGENT_PROTOCOL_V1_3.md # Agent integration protocol
│   └── reports/            # Implementation status reports
│
├── .github/workflows/      # CI: build, sonar, freeze gate
├── package.json            # npm config + scripts
├── tsconfig.json           # TypeScript config
├── vitest.config.ts        # Test runner config
├── eslint.config.js        # ESLint + SonarJS config
└── sonar-project.properties # SonarCloud config
```

---

## NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `test` | `vitest run` | Run 101 automated tests |
| `bench` | `tsx bench/scripts/harness.ts && ...` | Performance benchmarks |
| `bench:forensics` | `tsx bench/forensics/...` | Determinism verification harness |
| `verify` | `tsx tools/verify/verify.ts` | Standalone integrity check |
| `lint` | `eslint src/**/*.ts` | ESLint + SonarJS code quality |
| `sonar` | `sonar-scanner` | SonarCloud analysis |

---

## Related Repositories

| Repository | Purpose |
|------------|---------|
| **GICS-ARCHIVE** | Historical versions (v1.1, v1.2) + legacy code from v1.3 sanitization |

---

*Document version: 1.3.0 | Updated: 2026-02-11*
