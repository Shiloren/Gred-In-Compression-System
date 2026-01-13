/**
 * GICS IntegrityGuardian - Infrastructure-Grade File Integrity
 *
 * @module gics
 * @version 1.1.0
 * @status FROZEN - Canonical implementation
 * @see docs/GICS_V1.1_SPEC.md
 *
 * Provides SHA-256 based verification for GICS files beyond CRC32.
 * Use cases: Cloud sync verification, long-term archive validation, tamper detection.
 *
 * @author Gred In Labs
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
// ============================================================================
// IntegrityGuardian
// ============================================================================
export class IntegrityGuardian {
    algorithm;
    saveManifest;
    constructor(config) {
        this.algorithm = config?.algorithm ?? 'sha256';
        this.saveManifest = config?.saveManifest ?? true;
    }
    /**
     * Calculate hash of a buffer
     */
    hashBuffer(data) {
        return createHash(this.algorithm).update(data).digest('hex');
    }
    /**
     * Calculate hash of a file
     */
    async hashFile(filePath) {
        const data = await fs.readFile(filePath);
        const stats = await fs.stat(filePath);
        return {
            path: filePath,
            size: stats.size,
            hash: this.hashBuffer(data),
            algorithm: this.algorithm,
            verifiedAt: Date.now()
        };
    }
    /**
     * Create integrity manifest for a directory of GICS files
     */
    async createManifest(directory) {
        const files = await fs.readdir(directory);
        const gicsFiles = files.filter(f => f.endsWith('.gics'));
        const manifest = {
            version: 1,
            createdAt: Date.now(),
            files: {}
        };
        for (const filename of gicsFiles) {
            const filePath = `${directory}/${filename}`;
            const record = await this.hashFile(filePath);
            manifest.files[filename] = record;
        }
        if (this.saveManifest) {
            const manifestPath = `${directory}/gics.manifest.json`;
            await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        }
        return manifest;
    }
    /**
     * Verify files against a manifest
     */
    async verifyManifest(manifest, directory) {
        const start = Date.now();
        const passed = [];
        const failed = [];
        for (const [filename, expected] of Object.entries(manifest.files)) {
            const filePath = `${directory}/${filename}`;
            try {
                const actual = await this.hashFile(filePath);
                if (actual.hash !== expected.hash) {
                    failed.push({
                        path: filename,
                        reason: `Hash mismatch: expected ${expected.hash.substring(0, 16)}..., got ${actual.hash.substring(0, 16)}...`
                    });
                }
                else if (actual.size !== expected.size) {
                    failed.push({
                        path: filename,
                        reason: `Size mismatch: expected ${expected.size}, got ${actual.size}`
                    });
                }
                else {
                    passed.push(filename);
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                failed.push({ path: filename, reason: `File read error: ${message}` });
            }
        }
        return {
            valid: failed.length === 0,
            passed,
            failed,
            durationMs: Date.now() - start
        };
    }
    /**
     * Load manifest from file
     */
    async loadManifest(manifestPath) {
        const content = await fs.readFile(manifestPath, 'utf-8');
        return JSON.parse(content);
    }
    /**
     * Quick verification of a single file against expected hash
     */
    async verifyFile(filePath, expectedHash) {
        try {
            const record = await this.hashFile(filePath);
            return record.hash === expectedHash;
        }
        catch {
            return false;
        }
    }
    /**
     * Verify in-memory buffer against expected hash
     */
    verifyBuffer(data, expectedHash) {
        return this.hashBuffer(data) === expectedHash;
    }
}
