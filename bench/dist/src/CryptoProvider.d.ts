/**
 * GICS CryptoProvider - FIPS-Compliant Cryptographic Operations
 *
 * @module gics
 * @version 1.1.0
 * @status FROZEN - Canonical implementation
 * @see docs/GICS_V1.1_SPEC.md
 *
 * Provides a hardened cryptographic abstraction layer for GICS.
 * Compliance: FIPS 140-3, NIST SP 800-131A, Common Criteria (ISO/IEC 15408)
 *
 * @author Gred In Labs
 */
/** Approved hash algorithms per FIPS 180-4 */
export declare const APPROVED_HASH_ALGORITHMS: readonly ["sha256", "sha384", "sha512"];
export type ApprovedHashAlgorithm = typeof APPROVED_HASH_ALGORITHMS[number];
/** Approved symmetric ciphers per FIPS 197 (AES) */
export declare const APPROVED_CIPHER_ALGORITHMS: readonly ["aes-256-gcm", "aes-256-cbc"];
export type ApprovedCipherAlgorithm = typeof APPROVED_CIPHER_ALGORITHMS[number];
/** Minimum key lengths per NIST SP 800-131A */
export declare const MINIMUM_KEY_LENGTHS: {
    readonly 'aes-256-gcm': 32;
    readonly 'aes-256-cbc': 32;
};
/** IV/Nonce lengths per NIST SP 800-38D (GCM) */
export declare const REQUIRED_IV_LENGTHS: {
    readonly 'aes-256-gcm': 12;
    readonly 'aes-256-cbc': 16;
};
export declare class CryptoComplianceError extends Error {
    constructor(message: string);
}
export declare class AlgorithmNotApprovedError extends CryptoComplianceError {
    constructor(algorithm: string, type: 'hash' | 'cipher');
}
export declare class FipsModeRequiredError extends CryptoComplianceError {
    constructor();
}
export declare class CryptoProvider {
    private readonly strictMode;
    private readonly auditLog;
    constructor(options?: {
        strictMode?: boolean;
        auditLog?: boolean;
    });
    /**
     * Check if Node.js is running in FIPS mode
     * FIPS mode requires: NODE_OPTIONS=--enable-fips (Node 18+)
     */
    static isFipsMode(): boolean;
    /**
     * Enforce FIPS mode or throw
     */
    static requireFipsMode(): void;
    /**
     * Check if STRICT_FIPS environment flag is set
     * Use this to conditionally enable strict mode in regulated environments
     */
    static isStrictFipsEnabled(): boolean;
    /**
     * Validate hash algorithm is approved
     */
    static isApprovedHashAlgorithm(algorithm: string): algorithm is ApprovedHashAlgorithm;
    /**
     * Validate cipher algorithm is approved
     */
    static isApprovedCipherAlgorithm(algorithm: string): algorithm is ApprovedCipherAlgorithm;
    /**
     * Validate key length meets minimum requirements
     */
    static validateKeyLength(algorithm: ApprovedCipherAlgorithm, keyLength: number): void;
    /**
     * Validate IV/nonce length
     */
    static validateIvLength(algorithm: ApprovedCipherAlgorithm, ivLength: number): void;
    /**
     * Compute hash using approved algorithm only
     * @throws AlgorithmNotApprovedError if algorithm not in approved list
     */
    hash(algorithm: string, data: Buffer | Uint8Array): Buffer;
    /**
     * Compute SHA-256 hash (most common FIPS-approved hash)
     */
    sha256(data: Buffer | Uint8Array): Buffer;
    /**
     * Compute SHA-512 hash
     */
    sha512(data: Buffer | Uint8Array): Buffer;
    /**
     * Generate cryptographically secure random bytes
     * Uses /dev/urandom (Linux) or CryptGenRandom (Windows)
     */
    static randomBytes(length: number): Buffer;
    /**
     * Securely wipe a buffer from memory
     * Overwrites with random data, then zeros, then random again
     *
     * Based on DoD 5220.22-M sanitization standard
     */
    static wipe(buffer: Buffer): void;
    /**
     * Create a secure buffer that auto-wipes on GC
     * Note: V8's GC is not deterministic, so explicit wipe() is preferred
     */
    static secureBuffer(size: number): Buffer;
    /**
     * Get compliance status report
     */
    static getComplianceReport(): {
        fipsMode: boolean;
        strictFipsEnabled: boolean;
        approvedHashes: readonly string[];
        approvedCiphers: readonly string[];
        availableHashes: string[];
        availableCiphers: string[];
        nodeVersion: string;
    };
}
