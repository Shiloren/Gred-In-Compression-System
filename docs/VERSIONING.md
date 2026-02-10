# GICS Versioning

> **Purpose**: Document version history and location of each GICS release.

---

## Version Matrix

| Version | Status | Location | Notes |
|---------|--------|----------|-------|
| **v1.1.0** | 🏛️ Archived | `GICS-ARCHIVE/versions/v1.1/frozen/` | Original frozen implementation |
| **v1.2.0** | 🏛️ Archived | `GICS-ARCHIVE/versions/v1.2/` | Verification suite + legacy formats |
| **v1.3.0** | ✅ Production | **This repository** | Current stable version with Encryption + Schema |

---

## v1.1.0 — Frozen (Archived)
Original GICS implementation. Immutable reference.

## v1.2.0 — Legacy (Archived)
Stable legacy version. Archived for historical reproducibility.

## v1.3.0 — Current Production
Current active version.
- **Key Features**: StreamSegments, AES-256-GCM Encryption, JSON Schema profiles, SHA-256 Integrity Chain, CHM (Compression Health Monitor).
- **Spec**: See [FORMAT.md](./FORMAT.md)
- **API**: See [API.md](./API.md)
- **Security**: See [SECURITY_MODEL.md](./SECURITY_MODEL.md)
- **Report**: See [docs/reports/GICS_v1.3_IMPLEMENTATION_REPORT.md](./reports/GICS_v1.3_IMPLEMENTATION_REPORT.md)

### v1.3 Legacy Archival (2026-02-11)
Legacy files from the v1.3 development cycle (hybrid prototypes, v1.2-era tests, deprecated docs) were moved to `GICS-ARCHIVE/versions/v1.3-legacy/`. This repository now contains only production v1.3 code.

---

## Deprecation Policy

- **Archived versions** (v1.1, v1.2) are **read-only**.
- **v1.3 legacy files** archived at `GICS-ARCHIVE/versions/v1.3-legacy/`.
- **v1.3.0** is the current source of truth.

---

*Document version: 1.3 | Updated: 2026-02-11*
