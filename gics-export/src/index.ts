/**
 * GICS - Gred In Compression System
 * 
 * Ultra-efficient time-series compression for price data.
 * Designed for WoW Auction House, generalizable to any market.
 * 
 * @author Gred In Labs
 * @license Proprietary - Contact for commercial licensing
 * @version 1.0.0
 * 
 * Features:
 * - 100x compression ratio for price time-series
 * - 100% LOSSLESS - every data point recoverable
 * - Streaming append (no rewrite needed)
 * - Query without full decompression
 * 
 * Architecture:
 * - Delta encoding for temporal redundancy
 * - Adaptive bit-packing based on value distribution
 * - Zstandard final compression
 */

export { GICSWriter } from './gics-writer.js';
export { GICSReader } from './gics-reader.js';
export { GICSEncoder } from './gics-encoder.js';
export { GICSDecoder } from './gics-decoder.js';

// Types
export type {
    PricePoint,
    Snapshot,
    GICSConfig,
    GICSStats,
    ItemHistory
} from './gics-types.js';

// Constants
export const GICS_VERSION = '1.0.0';
export const GICS_MAGIC = 'GICS';

// GICS v0.4 - Hybrid Storage (100× compression with item queries)
export { HybridWriter, HybridReader, ItemQuery, TierClassifier, MarketIntelligence } from './gics-hybrid.js';
export type { HybridConfig, QueryFilter, ItemQueryResult, MarketOpportunity, HybridReaderOptions } from './gics-hybrid.js';
export type { GICSHybridConfig, ItemTier } from './gics-types.js';

// GICS Production Service (ultra-simple API)
export { gics, createGICSService, GICSService } from './gics-service.js';
export type { ItemHistoryResult, SnapshotResult, MarketIntelResult, GICSServiceConfig } from './gics-service.js';
