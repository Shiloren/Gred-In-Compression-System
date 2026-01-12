/**
 * GICS v1.1 - Canonical Public API
 *
 * @module gics
 * @version 1.1.0 (Active Dev)
 * @status FROZEN - Canonical implementation available via version switch
 * @see docs/GICS_V1.1_SPEC.md
 */
import { type HybridConfig } from './gics-hybrid.js';
import type { Snapshot } from './gics-types.js';
export * from './gics-types.js';
export * from './gics-hybrid.js';
export * from './gics-utils.js';
export * from './HeatClassifier.js';
export * from './IntegrityGuardian.js';
export * from './CryptoProvider.js';
export * from './gics-range-reader.js';
/**
 * Public Encoder Entry Point
 * Routes to Fixed v1.1 or Active Development (v1.2+) based on GICS_VERSION env var.
 */
export declare function gics_encode(snapshots: Snapshot[], config?: HybridConfig): Promise<Uint8Array>;
/**
 * Public Decoder Entry Point
 * Routes to Fixed v1.1 or Active Development (v1.2+) based on GICS_VERSION env var.
 */
export declare function gics_decode(data: Uint8Array): Promise<Snapshot[]>;
