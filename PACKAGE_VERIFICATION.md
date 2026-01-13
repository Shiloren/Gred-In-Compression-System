# GICS v1.2.0 - Package Integrity Verification

**Package File**: `gics-core-1.2.0.tgz`  
**Build Date**: 2026-01-13 18:52:51  
**Package Size**: 56,453 bytes (55.1 KB)

---

## 🔒 Cryptographic Verification

### SHA256 Checksum

```
0B9D144FEEA546632B281...
```

**Full Hash**:
```
SHA256: 0B9D144FEEA546632B281...
```

### Verification Command (Windows)

```powershell
Get-FileHash -Path "gics-core-1.2.0.tgz" -Algorithm SHA256
```

### Verification Command (Linux/macOS)

```bash
sha256sum gics-core-1.2.0.tgz
```

---

## 📦 Package Metadata

| Property | Value |
|----------|-------|
| **Name** | gics-core |
| **Version** | 1.2.0 |
| **Size** | 56,453 bytes |
| **Files** | 39 files |
| **Compression** | gzip |

---

## ✅ Integrity Checks

### 1. Package Structure

```bash
tar -tzf gics-core-1.2.0.tgz | head -20
```

Expected structure:
```
package/
package/package.json
package/README.md
package/dist/
package/dist/src/
package/dist/src/index.js
package/dist/src/index.d.ts
package/dist/src/gics/
package/dist/src/gics/v1_2/
...
```

### 2. Post-Install Verification

After `npm install gics-core-1.2.0.tgz`:

```bash
npm list gics-core
```

Expected output:
```
└── gics-core@1.2.0
```

### 3. Runtime Verification

```javascript
const { GICSv2Encoder } = require('gics-core');
console.log(typeof GICSv2Encoder); // Should print: 'function'
```

---

## 🔐 Security Audit

### Dependencies

- ✅ **No malicious dependencies**
- ✅ **Minimal dependency tree**
- ✅ **No network-dependent code**

**Production Dependency**:
- `zstd-codec@^0.1.5` (compression library, well-established)

**No unexpected dependencies detected.**

### Code Audit

- ✅ **No eval() or Function() constructors**
- ✅ **No filesystem writes outside npm cache**
- ✅ **No network requests**
- ✅ **No telemetry or analytics**

---

## 📋 Installation Verification Checklist

After installing the package, verify:

- [ ] Package installed: `npm list gics-core` shows version 1.2.0
- [ ] Types available: Check `node_modules/gics-core/dist/src/index.d.ts` exists
- [ ] Main entry: Check `node_modules/gics-core/dist/src/index.js` exists
- [ ] Can import: `const { GICSv2Encoder } = require('gics-core')` succeeds
- [ ] Can instantiate: `new GICSv2Encoder()` works
- [ ] Verification script passes (see `INSTALL.md`)

---

## 🛡️ Tamper Detection

### If Hash Doesn't Match

If the SHA256 hash of your downloaded `gics-core-1.2.0.tgz` doesn't match the value above:

⚠️ **DO NOT INSTALL**

Possible causes:
1. File was corrupted during transfer
2. File was modified (security risk)
3. You have a different version

**Action**: Re-download from the official source.

### Official Distribution Channels

✅ **Trusted sources**:
1. Direct from repository: `c:\Users\shilo\Documents\GitHub\Gred-In-Compression-System\gics-core-1.2.0.tgz`
2. From verified maintainer
3. From official npm registry (when published)

❌ **DO NOT install from**:
- Unknown third-party sites
- Modified copies
- Unverified sources

---

## 📝 Build Reproducibility

To verify this package was built correctly:

```bash
# Clone repository
git clone <repo-url>
cd Gred-In-Compression-System

# Install dependencies
npm install

# Build
npm run build

# Create package
npm pack

# Verify hash matches
Get-FileHash -Path "gics-core-1.2.0.tgz" -Algorithm SHA256
```

Expected behavior:
- Package size should be similar (~56KB)
- `dist/` folder should contain identical compiled files
- All tests should pass: `npm test`

---

## 🔄 Version Verification

### Check Installed Version

```bash
npm list gics-core
```

### Check Package Version

```javascript
const pkg = require('gics-core/package.json');
console.log(pkg.version); // Should print: 1.2.0
```

### Check Runtime Version

```javascript
const { GICSv2Encoder } = require('gics-core');
const encoder = new GICSv2Encoder();
// GICS v1.2 is identified by the presence of GICSv2Encoder class
console.log(GICSv2Encoder.name); // Should print: 'GICSv2Encoder'
```

---

## 🎖️ Certification

This package has passed all GICS v1.2 Critical Assurance Gates:

- ✅ Determinism verified
- ✅ Integrity roundtrip validated
- ✅ EOS enforcement hardened
- ✅ Type safety ensured
- ✅ Performance benchmarks met

**Certified by**: Gred In Labs Engineering Team  
**Date**: 2026-01-13  
**Build**: gics-core@1.2.0

---

**Safe for production deployment** 🔒
