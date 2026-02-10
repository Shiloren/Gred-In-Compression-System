# GICS v1.3 API Reference & Integration Guide

> Complete reference for consuming, integrating, and operating GICS in production systems.

---

## Table of Contents

1. [Installation & Requirements](#installation--requirements)
2. [Quick Start](#quick-start)
3. [Public API](#public-api)
   - [GICS.pack()](#gicspack)
   - [GICS.unpack()](#gicsunpack)
   - [GICS.verify()](#gicsverify)
   - [GICS.Encoder (streaming)](#gicsencoder-streaming)
   - [GICS.Decoder (advanced)](#gicsdecoder-advanced)
   - [GICS.schemas](#gicsschemas)
4. [Schema Profiles](#schema-profiles)
   - [Defining a Schema](#defining-a-schema)
   - [Categorical Fields](#categorical-fields)
   - [String Item IDs](#string-item-ids)
   - [Predefined Schemas](#predefined-schemas)
5. [Encryption](#encryption)
6. [Integration Patterns](#integration-patterns)
   - [Node.js Service](#nodejs-service)
   - [File-Based Pipeline](#file-based-pipeline)
   - [Streaming / Append Mode](#streaming--append-mode)
   - [Query by Item ID](#query-by-item-id)
   - [Cross-System Interop](#cross-system-interop)
7. [Error Handling](#error-handling)
   - [Error Hierarchy](#error-hierarchy)
   - [Failure Modes](#failure-modes)
   - [Recovery Strategies](#recovery-strategies)
8. [Performance Characteristics](#performance-characteristics)
9. [Invariants & Guarantees](#invariants--guarantees)

---

## Installation & Requirements

```bash
npm install gics-core
```

**Runtime requirements:**
- Node.js >= 18.0.0
- Single runtime dependency: `zstd-codec` (WebAssembly, no native compilation)

**No network access required.** GICS is fully offline.

---

## Quick Start

```typescript
import { GICS } from 'gics-core';

// Create snapshots
const snapshots = [
  {
    timestamp: 1700000000,
    items: new Map([
      [1, { price: 15000, quantity: 100 }],
      [2, { price: 8500, quantity: 250 }],
    ]),
  },
  {
    timestamp: 1700000060,
    items: new Map([
      [1, { price: 15010, quantity: 98 }],
      [2, { price: 8495, quantity: 260 }],
    ]),
  },
];

// Compress
const compressed = await GICS.pack(snapshots);

// Decompress
const restored = await GICS.unpack(compressed);

// Verify integrity without decompressing
const isValid = await GICS.verify(compressed);
```

---

## Public API

### GICS.pack()

Compresses an array of snapshots into a single GICS binary blob.

```typescript
GICS.pack(
  snapshots: Snapshot[],
  options?: EncoderOptions
): Promise<Uint8Array>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `snapshots` | `Snapshot[]` | Yes | Array of time-series snapshots |
| `options.password` | `string` | No | Enable AES-256-GCM encryption |
| `options.schema` | `SchemaProfile` | No | Custom field schema (omit for legacy price/quantity) |
| `options.contextMode` | `'on' \| 'off'` | No | Dictionary context sharing. Default: `'on'` |
| `options.segmentSizeLimit` | `number` | No | Bytes per segment. Default: `1048576` (1 MB) |
| `options.probeInterval` | `number` | No | CHM probe frequency. Default: `4` |
| `options.logger` | `Logger` | No | Route internal log messages |
| `options.sidecarWriter` | `Function` | No | Persist anomaly reports externally |

**Returns:** `Promise<Uint8Array>` - The compressed GICS binary.

**Throws:** `Error` if encoder is already finalized.

---

### GICS.unpack()

Decompresses a GICS binary back into snapshots.

```typescript
GICS.unpack(
  data: Uint8Array,
  options?: DecoderOptions
): Promise<Snapshot[]>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | `Uint8Array` | Yes | GICS compressed binary |
| `options.password` | `string` | No | Password for encrypted files |
| `options.integrityMode` | `'strict' \| 'warn'` | No | Hash chain verification mode. Default: `'strict'` |
| `options.logger` | `Logger` | No | Route warning messages |

**Returns:** `Promise<Snapshot[]>` - Restored snapshots with exact original data.

**Throws:**
- `IntegrityError` - Magic bytes invalid, hash chain mismatch, CRC failure, wrong password
- `IncompleteDataError` - File truncated, missing EOS marker
- `LimitExceededError` - Decompression size exceeds 64 MB safety limit

---

### GICS.verify()

Verifies file integrity (SHA-256 chain + CRC32) **without decompressing payloads**. Fast integrity check for monitoring or ingestion gates.

```typescript
GICS.verify(data: Uint8Array): Promise<boolean>
```

**Returns:** `true` if all integrity checks pass, `false` otherwise. Never throws.

---

### GICS.Encoder (streaming)

For incremental encoding, append-to-file, or fine-grained control.

```typescript
import { GICS } from 'gics-core';

const encoder = new GICS.Encoder({ password: 'secret' });

// Add snapshots one at a time
await encoder.addSnapshot(snapshot1);
await encoder.addSnapshot(snapshot2);

// Flush intermediate segments (for streaming)
const partialBytes = await encoder.flush();

// Finalize and get complete binary
const finalBytes = await encoder.finish();
```

**File append mode** (write directly to disk without buffering everything in memory):

```typescript
import { open } from 'node:fs/promises';

const handle = await open('data.gics', 'r+');
const encoder = await GICS.Encoder.openFile(handle, { segmentSizeLimit: 2_000_000 });

await encoder.addSnapshot(newSnapshot);
await encoder.sealToFile(); // writes segments + EOS directly to file
await handle.close();
```

**Telemetry** (after encoding):

```typescript
const telemetry = encoder.getTelemetry();
// {
//   total_blocks: 12,
//   core_ratio: 8.5,
//   quarantine_rate: 0.08,
//   quarantine_blocks: 1,
//   blocks: [ ... per-block stats ... ]
// }
```

---

### GICS.Decoder (advanced)

For querying specific items, inspecting schemas, or generic snapshot access.

```typescript
const decoder = new GICS.Decoder(data, { integrityMode: 'strict' });

// Standard decode
const snapshots = await decoder.getAllSnapshots();

// Query a specific item (skips segments via Bloom filter)
const filtered = await decoder.query(42);

// Generic decode (schema-based files with arbitrary fields)
const generic = await decoder.getAllGenericSnapshots();

// Query by string key (schema files with string IDs)
const results = await decoder.queryGeneric('file_write|main.ts');

// Inspect schema without decoding data
await decoder.parseHeader();
const schema = decoder.getSchema();
```

---

### GICS.schemas

Predefined schema profiles for common use cases.

```typescript
GICS.schemas.MARKET_DATA
// { id: 'market_data_v1', version: 1, itemIdType: 'number',
//   fields: [{ name: 'price', type: 'numeric', codecStrategy: 'value' },
//            { name: 'quantity', type: 'numeric', codecStrategy: 'structural' }] }

GICS.schemas.TRUST_EVENTS
// { id: 'gimo_trust_v1', version: 1, itemIdType: 'string',
//   fields: [{ name: 'score', ... }, { name: 'approvals', ... },
//            { name: 'outcome', type: 'categorical', enumMap: {...} }] }
```

---

## Schema Profiles

Schema Profiles make GICS generic for any structured time-series, not just price/quantity.

### Defining a Schema

```typescript
import { GICS, type SchemaProfile } from 'gics-core';

const sensorSchema: SchemaProfile = {
  id: 'iot_sensors_v1',
  version: 1,
  itemIdType: 'string',        // sensor IDs are strings like "temp_rack_03"
  fields: [
    { name: 'temperature', type: 'numeric', codecStrategy: 'value' },
    { name: 'humidity',    type: 'numeric', codecStrategy: 'value' },
    { name: 'pressure',   type: 'numeric', codecStrategy: 'structural' },
    { name: 'status',     type: 'categorical', enumMap: { ok: 0, warn: 1, critical: 2 } },
  ],
};

const snapshots = [{
  timestamp: 1700000000,
  items: new Map([
    ['temp_rack_03', { temperature: 2250, humidity: 65, pressure: 1013, status: 'ok' }],
    ['temp_rack_07', { temperature: 2310, humidity: 62, pressure: 1012, status: 'warn' }],
  ]),
}];

const compressed = await GICS.pack(snapshots, { schema: sensorSchema });
```

### Categorical Fields

Categorical fields map string labels to compact numeric codes. The `enumMap` is stored inside the GICS file, so the decoder reconstructs the original strings automatically.

```typescript
{ name: 'outcome', type: 'categorical', enumMap: { approved: 0, rejected: 1, error: 2 } }
```

Encoder converts `'approved'` to `0` before compression. Decoder converts `0` back to `'approved'`.

### String Item IDs

When `itemIdType: 'string'`, GICS builds a **String Dictionary** per segment:
- String keys are sorted, delta-length-encoded, and stored alongside the Bloom filter index.
- Queries by string key (`queryGeneric('some_key')`) work via dictionary lookup + Bloom filter skip.
- The dictionary is transparent to the consumer; the API accepts and returns strings directly.

### Predefined Schemas

| Schema | ID | itemIdType | Fields |
|--------|----|------------|--------|
| `MARKET_DATA` | `market_data_v1` | `number` | price (value), quantity (structural) |
| `TRUST_EVENTS` | `gimo_trust_v1` | `string` | score, approvals, rejections, failures, streak, outcome (categorical) |

**Using without schema** produces bytes identical to v1.3 legacy format (full backward compatibility).

---

## Encryption

GICS v1.3 supports AES-256-GCM encryption with PBKDF2 key derivation.

```typescript
// Encrypt
const encrypted = await GICS.pack(snapshots, { password: 'my-secret-key' });

// Decrypt
const restored = await GICS.unpack(encrypted, { password: 'my-secret-key' });

// Wrong password → IntegrityError (immediate, fail-closed)
await GICS.unpack(encrypted, { password: 'wrong' }); // throws IntegrityError
```

**Details:**
- KDF: PBKDF2-HMAC-SHA256, 100,000 iterations
- Unique 16-byte salt + 12-byte nonce per file
- Auth tag verification before any decryption attempt
- Each stream section encrypted independently with deterministic IV (HMAC-derived)
- See [SECURITY_MODEL.md](./SECURITY_MODEL.md) for full threat model

---

## Integration Patterns

### Node.js Service

```typescript
import { GICS } from 'gics-core';
import { readFile, writeFile } from 'node:fs/promises';

class TimeSeriesStore {
  async save(snapshots: Snapshot[], path: string, password?: string): Promise<void> {
    const binary = await GICS.pack(snapshots, { password });
    await writeFile(path, binary);
  }

  async load(path: string, password?: string): Promise<Snapshot[]> {
    const binary = new Uint8Array(await readFile(path));
    return GICS.unpack(binary, { password });
  }

  async healthCheck(path: string): Promise<boolean> {
    const binary = new Uint8Array(await readFile(path));
    return GICS.verify(binary);
  }
}
```

### File-Based Pipeline

For ETL or batch processing where data flows through stages:

```
[Data Source] → Snapshot[] → GICS.pack() → .gics file → GICS.unpack() → [Consumer]
```

```typescript
// Producer (writes hourly)
const hourlyData = collectLastHour();
const binary = await GICS.pack(hourlyData, {
  schema: mySchema,
  segmentSizeLimit: 2_000_000,  // 2MB segments for large batches
});
await writeFile(`data_${Date.now()}.gics`, binary);

// Consumer (reads on demand)
const binary = new Uint8Array(await readFile(filePath));
const decoder = new GICS.Decoder(binary);
await decoder.parseHeader();
const schema = decoder.getSchema();  // inspect fields before decoding
const snapshots = await decoder.getAllGenericSnapshots();
```

### Streaming / Append Mode

For long-running services that continuously append data:

```typescript
import { open } from 'node:fs/promises';

// Initial creation
const handle = await open('timeseries.gics', 'w+');
const encoder = await GICS.Encoder.openFile(handle);

// Append periodically
setInterval(async () => {
  const snapshot = collectCurrentSnapshot();
  await encoder.addSnapshot(snapshot);
  await encoder.flush();  // writes segment to disk
}, 60_000);

// On shutdown: finalize
process.on('SIGTERM', async () => {
  await encoder.sealToFile();  // writes final segment + EOS
  await handle.close();
});
```

### Query by Item ID

GICS supports efficient item-specific queries using Bloom filter skip:

```typescript
const decoder = new GICS.Decoder(data);

// Numeric item IDs (legacy mode)
const item42History = await decoder.query(42);
// Returns only snapshots containing item 42
// Segments without item 42 are skipped entirely (Bloom filter)

// String item IDs (schema mode)
const results = await decoder.queryGeneric('sensor_rack_03');
// Looks up string dictionary → numeric ID → Bloom filter → decode
```

**Performance:** Query skips entire segments where the Bloom filter indicates the item is absent. For files with many segments, this is significantly faster than full decode.

### Cross-System Interop

GICS produces a self-contained binary format. Any system that can read `Uint8Array` / `Buffer` can consume it:

```typescript
// Send over HTTP
app.get('/data/:id', async (req, res) => {
  const binary = await loadGicsFile(req.params.id);
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Disposition', 'attachment; filename="data.gics"');
  res.send(Buffer.from(binary));
});

// Store in database (as BLOB)
await db.query('INSERT INTO archives (id, data) VALUES ($1, $2)', [id, Buffer.from(binary)]);

// Read from database
const row = await db.query('SELECT data FROM archives WHERE id = $1', [id]);
const snapshots = await GICS.unpack(new Uint8Array(row.rows[0].data));

// S3 / Object Storage
await s3.putObject({ Bucket: 'ts-data', Key: 'data.gics', Body: binary });
const obj = await s3.getObject({ Bucket: 'ts-data', Key: 'data.gics' });
const snapshots = await GICS.unpack(new Uint8Array(await obj.Body.transformToByteArray()));
```

**Wire format:** See [FORMAT.md](./FORMAT.md) for full binary specification if you need to implement a reader in another language.

---

## Error Handling

### Error Hierarchy

```
GicsError (base)
├── IntegrityError          — Data corruption, hash mismatch, wrong password
│   └── IncompleteDataError — Truncated file, missing EOS marker
└── LimitExceededError      — Decompression bomb protection (>64MB section)
```

All errors extend `Error` and include descriptive messages. Import them for typed catches:

```typescript
import { IntegrityError, IncompleteDataError } from 'gics-core';

try {
  const snapshots = await GICS.unpack(data, { password });
} catch (err) {
  if (err instanceof IncompleteDataError) {
    // File was truncated — re-download or discard
    log.warn('Truncated GICS file:', err.message);
  } else if (err instanceof IntegrityError) {
    // Corruption or wrong password — reject
    log.error('Integrity failure:', err.message);
  } else {
    throw err; // unexpected
  }
}
```

### Failure Modes

| Scenario | Error | Cause | Recovery |
|----------|-------|-------|----------|
| File truncated during write | `IncompleteDataError` | Missing EOS marker (0xFF) | Re-encode from source data |
| Bit flip in storage | `IntegrityError` | CRC32 mismatch on segment | Re-download or restore from backup |
| Hash chain tampered | `IntegrityError` | SHA-256 chain broken | File was modified externally; reject |
| Wrong password | `IntegrityError` | HMAC auth verify fails | Prompt for correct password |
| No password on encrypted file | `Error` | Password required but not provided | Supply password in options |
| File too short (<4 bytes) | `Error` | Not a GICS file | Check file source |
| Unsupported version byte | `IntegrityError` | Version != 0x02 or 0x03 | Use compatible GICS decoder |
| Decompression bomb | `LimitExceededError` | Section claims >64MB uncompressed | Reject file (malicious or corrupt) |
| Schema field count mismatch | `IntegrityError` | Encoded fields != schema definition | Schema was modified after encoding |
| Cross-stream length mismatch | `IntegrityError` | TIME count != SNAPSHOT_LEN count | Internal corruption; re-encode |
| Zstd decompression failure | `Error` | Corrupt compressed payload | Re-encode from source |

### Recovery Strategies

**General principle: GICS is fail-closed.** It will never silently return partial or wrong data.

1. **Retry logic is not needed** for decode errors — they indicate data corruption, not transient failures.
2. **Verify before processing** in pipelines: `if (await GICS.verify(data)) { ... }` is cheap and catches corruption early.
3. **Integrity mode `'warn'`** (not recommended for production) continues decoding on hash mismatch:
   ```typescript
   const snapshots = await GICS.unpack(data, { integrityMode: 'warn', logger: myLogger });
   ```
4. **For append workflows**, if the process crashes mid-write the file may lack an EOS marker. The `Encoder.openFile()` method detects and resumes from the last valid EOS.

---

## Performance Characteristics

| Metric | Typical Value | Notes |
|--------|---------------|-------|
| Compression ratio | 5x - 20x | Depends on data regularity (structured > chaotic) |
| Encode throughput | ~50,000 snapshots/sec | Single-threaded, on modern hardware |
| Decode throughput | ~80,000 snapshots/sec | Decompression is faster than encoding |
| Verify throughput | ~200,000 snapshots/sec | No decompression, only hash/CRC checks |
| Memory usage | O(segment_size) | Default 1MB segments; configurable |
| Encryption overhead | ~5-10% | AES-256-GCM is hardware-accelerated on modern CPUs |

**Codec selection is automatic.** GICS tries multiple inner codecs per block and picks the smallest output:
- `DOD_VARINT` / `RLE_DOD` — Best for timestamps and regular intervals
- `VARINT_DELTA` — Best for slowly-changing values
- `BITPACK_DELTA` — Best for small, bounded deltas
- `RLE_ZIGZAG` — Best for sparse data with many repeated values
- `DICT_VARINT` — Best for values with high repetition (low cardinality)
- `FIXED64_LE` — Fallback for chaotic data (quarantined blocks)

The **Compression Health Monitor (CHM)** detects anomalous blocks (regime shifts, entropy spikes) and quarantines them with FIXED64 encoding to prevent ratio degradation.

---

## Invariants & Guarantees

These properties hold for all valid GICS v1.3 files:

| Invariant | Description |
|-----------|-------------|
| **Determinism** | Same input + same options = identical output bytes |
| **Lossless** | `unpack(pack(data)) === data` — exact roundtrip, zero precision loss |
| **Fail-closed** | Corrupt/truncated/tampered data always throws, never returns partial results |
| **Backward compatible** | v1.3 decoder reads v1.2 files; `pack()` without schema = v1.3 legacy bytes |
| **Schema embedded** | Schema profile is stored inside the file; decoder is self-describing |
| **Segment isolation** | Corruption in segment N does not affect segments N-1 or N+1 |
| **No external state** | No network calls, no filesystem reads during encode/decode (except explicit file-append mode) |

---

## Exported Types

```typescript
// Core data types
export type { Snapshot }           // { timestamp: number, items: Map<number, { price, quantity }> }
export type { GenericSnapshot }    // { timestamp: number, items: Map<number|string, Record<string, number|string>> }

// Schema types
export type { SchemaProfile }      // { id, version, itemIdType, fields: FieldDef[] }
export type { FieldDef }           // { name, type, codecStrategy?, enumMap? }

// Options
export type { EncoderOptions }     // { password?, schema?, contextMode?, segmentSizeLimit?, ... }
export type { DecoderOptions }     // { password?, integrityMode?, logger? }
export type { Logger }             // { info?, warn?, error? }

// Errors
export { IntegrityError }
export { IncompleteDataError }
```

---

*Document version: 1.3.0 | Last updated: 2026-02-11*
