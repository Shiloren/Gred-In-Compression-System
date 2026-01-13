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
export interface IntegrityConfig {
    /** Hash algorithm (default: sha256) */
    algorithm?: 'sha256' | 'sha512';
    /** Save manifest alongside GICS files (default: true) */
    saveManifest?: boolean;
}
export interface FileIntegrityRecord {
    /** File path (relative or absolute) */
    path: string;
    /** File size in bytes */
    size: number;
    /** SHA-256 hash of file contents */
    hash: string;
    /** Algorithm used */
    algorithm: string;
    /** Timestamp of last verification */
    verifiedAt: number;
}
export interface IntegrityManifest {
    /** Version of manifest format */
    version: 1;
    /** When manifest was created */
    createdAt: number;
    /** Map of filename → integrity record */
    files: Record<string, FileIntegrityRecord>;
}
export interface VerificationResult {
    /** Did all files pass verification? */
    valid: boolean;
    /** Files that passed */
    passed: string[];
    /** Files that failed with reason */
    failed: Array<{
        path: string;
        reason: string;
    }>;
    /** Total time taken in ms */
    durationMs: number;
}
export declare class IntegrityGuardian {
    private readonly algorithm;
    private readonly saveManifest;
    constructor(config?: IntegrityConfig);
    /**
     * Calculate hash of a buffer
     */
    hashBuffer(data: Uint8Array | Buffer): string;
    /**
     * Calculate hash of a file
     */
    hashFile(filePath: string): Promise<FileIntegrityRecord>;
    /**
     * Create integrity manifest for a directory of GICS files
     */
    createManifest(directory: string): Promise<IntegrityManifest>;
    /**
     * Verify files against a manifest
     */
    verifyManifest(manifest: IntegrityManifest, directory: string): Promise<VerificationResult>;
    /**
     * Load manifest from file
     */
    loadManifest(manifestPath: string): Promise<IntegrityManifest>;
    /**
     * Quick verification of a single file against expected hash
     */
    verifyFile(filePath: string, expectedHash: string): Promise<boolean>;
    /**
     * Verify in-memory buffer against expected hash
     */
    verifyBuffer(data: Uint8Array | Buffer, expectedHash: string): boolean;
}
