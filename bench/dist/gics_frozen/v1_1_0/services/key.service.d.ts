/**
 * GICS Key Service - Secure Key Management
 *
 * @module gics
 * @version 1.1.0
 * @status FROZEN - Canonical implementation
 * @see docs/GICS_V1.1_SPEC.md
 *
 * Manages the lifecycle of the Master Encryption Key.
 * Uses PBKDF2-SHA256 with 600k iterations. Keys stored in memory ONLY.
 */
/** KDF Algorithm Identifiers */
export declare const enum KdfId {
    PBKDF2_SHA256 = 1,
    ARGON2ID = 2
}
/** Digest Algorithm Identifiers */
export declare const enum DigestId {
    SHA256 = 1,
    SHA512 = 2
}
/** Current KDF Configuration */
export declare const KDF_CONFIG: {
    readonly id: KdfId.PBKDF2_SHA256;
    readonly iterations: 600000;
    readonly keyLen: 32;
    readonly digest: "sha256";
    readonly digestId: DigestId.SHA256;
};
export declare const SALT_LEN = 16;
export declare const IV_LEN = 12;
export declare const AUTH_TAG_LEN = 16;
export declare const FILE_NONCE_LEN = 8;
export declare const AUTH_VERIFY_LEN = 32;
export declare const KDF_ITERATIONS: 600000;
export declare const KDF_KEYLEN: 32;
export declare const KDF_DIGEST: "sha256";
export declare class LockedError extends Error {
    constructor(message?: string);
}
declare class KeyService {
    private masterKey;
    private isLocked;
    /**
     * Check if the vault has a valid key loaded
     */
    isAuthenticated(): boolean;
    /**
     * Unlock the vault by deriving the key from a password
     * @param password User-provided password
     * @param salt File-specific salt (16 bytes)
     * @param iterations Optional custom iterations (for reading old files)
     */
    unlock(password: string, salt: Buffer, iterations?: number): Promise<void>;
    /**
     * Lock the vault and wipe the key from memory
     */
    lock(): void;
    /**
     * Get the master key for encryption/decryption operations.
     * Throws if locked.
     */
    getKey(): Buffer;
    /**
     * Generate an HMAC-based authVerify token for a file.
     * Token = HMAC-SHA256(derivedKey, "GICS_VERIFY_V1" || salt || headerFixed)
     *
     * @param salt The file's salt
     * @param headerFixed Fixed header bytes to bind the token to
     */
    generateAuthVerify(salt: Buffer, headerFixed: Buffer): Buffer;
    /**
     * Verify an authVerify token using timing-safe comparison.
     * Returns true if valid, false otherwise.
     */
    verifyAuthVerify(expected: Buffer, salt: Buffer, headerFixed: Buffer): boolean;
    /**
     * Generate a new random salt
     */
    generateSalt(): Buffer;
    /**
     * Generate a new random file nonce (for deterministic IV)
     */
    generateFileNonce(): Buffer;
    /**
     * Generate deterministic IV from file nonce + block index
     * IV = fileNonce(8 bytes) + blockIndex(4 bytes LE)
     */
    generateDeterministicIV(fileNonce: Buffer, blockIndex: number): Buffer;
    /**
     * Get current KDF configuration for header serialization
     */
    getKdfConfig(): {
        id: KdfId.PBKDF2_SHA256;
        iterations: 600000;
        keyLen: 32;
        digest: "sha256";
        digestId: DigestId.SHA256;
    };
}
export declare const keyService: KeyService;
export {};
