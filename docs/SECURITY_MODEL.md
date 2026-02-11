# GICS Security Model (v1.3)

> Safety guarantees, encryption features, and threat model for GICS.

---

## 🔒 Core Security Principles

### 1. Deterministic-Only Operations
| Guarantee | Description |
|-----------|-------------|
| **No AI/ML** | Purely algorithmic compression with reproducible results |
| **No randomness** | Same input + password → identical output bytes |
| **No external calls** | Fully offline — zero network dependencies |

### 2. Fail-Closed Architecture
GICS **never silently accepts** malformed, modified, or incomplete data:
```
VALID INPUT   → Compressed output
INVALID INPUT → Immediate rejection (typed error)
TRUNCATED     → IncompleteDataError (requires EOS + Hash verify)
CORRUPTED     → IntegrityError (SHA-256 or CRC32 failure)
WRONG PWD     → AuthenticationError (PBKDF2/HMAC check)
```

## 🔐 Internal Data Integrity Chain
GICS v1.3 uses an internal data integrity chain to ensure every byte is valid.
1. **Block Level**: Verified during decompression.
2. **Section Level**: AES-GCM tag (if encrypted) + SectionHash.
3. **Segment Level**: Cumulative `RootHash` (SHA-256) updated after every section.
4. **File Level**: Final EOS marker contains the global state hash.

### In-Scope Threats
| Threat | Mitigation |
|--------|------------|
| **Data Truncation** | File-level EOS + SHA-256 final hash verification |
| **Bit-Flip / Tampering**| AES-GCM Auth Tags + CRC32 on every segment |
| **Unauthorized Access** | AES-256-GCM encryption of StreamSection payloads |
| **Replay Attacks** | Deterministic nonces derived from unique file salt |
| **Password Guessing** | PBKDF2 slowdown with 100k iterations |

### Out-of-Scope Threats
| Threat | Reason |
|--------|--------|
| **Endpoint Security** | GICS assumes the host environment is not compromised |
| **Key Distribution** | Password/Key management is up to the caller |
| **Side-channels** | Compression ratio can reveal data entropy (standard behavior) |

---

## 🔐 Data Integrity Chain
GICS v1.3 uses a "Chain of Integrity" to ensure every byte is valid.
1. **Block Level**: Verified during decompression.
2. **Section Level**: AES-GCM tag (if encrypted) + SectionHash.
3. **Segment Level**: Cumulative `RootHash` (SHA-256) updated after every section.
4. **File Level**: Final EOS marker contains the global state hash.

---

## ✅ Assurance Artifacts

| Artifact | Purpose | Location |
|----------|---------|----------|
| **Golden Corpus** | Encrypted roundtrip, tamper, wrong-password | `tests/gics-golden-corpus.test.ts` |
| **Format & Integrity** | Hash chain, version byte, stream sections | `tests/gics-v1.3-format.test.ts` |
| **Adversarial Tests** | Tampering rejection, truncation, corruption | `tests/gics-adversarial.test.ts` |
| **Generic Roundtrip** | Bit-exact schema + legacy verification | `tests/gics-generic-roundtrip.test.ts` |
| **Integrity Regression** | Seed-based deterministic roundtrip | `tests/regression/integrity_mismatch.test.ts` |
| **Forensics** | Cross-run determinism verification | `tests/gics-v1.3-forensics.test.ts` |

---

*Document version: 1.3 | Updated: 2026-02-11*
