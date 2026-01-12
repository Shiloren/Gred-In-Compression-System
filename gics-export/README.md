# GICS: Gred In Compression System v1.0

[![Build Status](https://github.com/username/gics/actions/workflows/ci.yml/badge.svg)](https://github.com/username/gics/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**GICS** is a high-performance, critical-grade time-series database engine designed for storing and querying market data history with extreme efficiency.

## 🚀 Key Features

- **Extreme Compression:** >100x ratio vs raw binary.
- **High Throughput:** >1M writes/sec on commodity hardware.
- **Fail-Safe:** Deterministic corruption detection and recovery.
- **Zero External Dependencies:** Pure TypeScript/Node.js.

## 📦 Installation

```bash
npm install @gred-in-labs/gics
```

## 🛠️ Usage

```typescript
import { HybridWriter, HybridReader } from '@gred-in-labs/gics';

// Writing Data
const writer = new HybridWriter();
await writer.addSnapshot({ timestamp: 1700000000, items: myMap });
const buffer = await writer.finish();

// Reading Data
const reader = new HybridReader(buffer);
const history = await reader.getItemHistory(12345);
```

## 📄 Documentation

- [Technical Manual](docs/GICS_MANUAL.md) - Full API and Architecture guide.
- [Audit Report](docs/GICS_MASTER_AUDIT.md) - Official v1.0 Verification and Limits analysis.

## 🧪 Testing

```bash
npm test
```

## 📜 License

MIT © Gred-In-Labs
