/**
 * GICS Production Service
 * 
 * Ultra-simple API for production use.
 * Auto-manages files, compression, and queries.
 * 
 * Usage:
 *   import { gics } from './gics-service';
 *   
 *   // Get item history
 *   const history = await gics.getItemHistory(12345);
 *   
 *   // Get snapshot at time
 *   const snapshot = await gics.getSnapshot(Date.now());
 *   
 *   // Get market intelligence
 *   const intel = await gics.getMarketIntelligence();
 * 
 * @author Gred In Labs
 * @version 1.0.0
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    HybridWriter,
    HybridReader,
    ItemQuery,
    MarketIntelligence,
    type HybridReaderOptions,
    type TimeRange
} from './gics-hybrid.js';
import type { Snapshot, PricePoint } from './gics-types.js';

// ============================================================================
// Types for LLM Function Calling
// ============================================================================

export interface ItemHistoryResult {
    itemId: number;
    found: boolean;
    dataPoints: number;
    history: PricePoint[];
    stats?: {
        minPrice: number;
        maxPrice: number;
        avgPrice: number;
        volatility: number;
        trend: 'up' | 'down' | 'stable';
        trendPercent: number;
    };
}

export interface SnapshotResult {
    timestamp: number;
    found: boolean;
    itemCount: number;
    items: Array<{
        itemId: number;
        price: number;
        quantity: number;
    }>;
}

export interface MarketIntelResult {
    timestamp: number;
    totalItems: number;
    hotItems: Array<{
        itemId: number;
        volatility: number;
        trend: 'up' | 'down' | 'stable';
        trendPercent: number;
    }>;
    warmItems: number;
    coldItems: number;
    topGainers: Array<{
        itemId: number;
        changePercent: number;
        currentPrice: number;
        previousPrice: number;
    }>;
    topLosers: Array<{
        itemId: number;
        changePercent: number;
        currentPrice: number;
        previousPrice: number;
    }>;
    /** Market sentiment based on trend distribution */
    marketSentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile';
    /** Average volatility across analyzed items (0-1 scale) */
    avgVolatility: number;
}

export interface GICSServiceConfig {
    /** Data directory (default: ./data/gics) */
    dataDir?: string;
    /** Realm ID (default: 1403) */
    realmId?: number;
    /** Auto-save interval in ms (default: 0 = disabled) */
    autoSaveInterval?: number;
    /** Enable salvage mode for corrupted files (default: true) */
    salvageMode?: boolean;
}

// ============================================================================
// GICS Production Service
// ============================================================================

class GICSService {
    private config: Required<GICSServiceConfig>;
    private reader: HybridReader | null = null;
    private writer: HybridWriter | null = null;
    private pendingSnapshots: Snapshot[] = [];
    private initialized = false;
    private lastLoadedFile: string | null = null;

    constructor(config?: GICSServiceConfig) {
        this.config = {
            dataDir: config?.dataDir ?? join(process.cwd(), 'data', 'gics'),
            realmId: config?.realmId ?? 1403,
            autoSaveInterval: config?.autoSaveInterval ?? 0,
            salvageMode: config?.salvageMode ?? true,
        };
    }

    // ========================================================================
    // Simple Query API (for LLM)
    // ========================================================================

    /**
     * Get price history for a single item
     * 
     * @example
     * const history = await gics.getItemHistory(12345);
     * // Returns: { itemId, found, dataPoints, history, stats }
     */
    async getItemHistory(
        itemId: number,
        options?: { startTime?: number; endTime?: number; limit?: number }
    ): Promise<ItemHistoryResult> {
        await this.ensureInitialized();

        if (!this.reader) {
            return { itemId, found: false, dataPoints: 0, history: [] };
        }

        const query = new ItemQuery(this.reader);
        const result = await query.getItemHistory(itemId, options?.startTime, options?.endTime);

        if (!result) {
            return { itemId, found: false, dataPoints: 0, history: [] };
        }

        const history = options?.limit
            ? result.history.slice(-options.limit)
            : result.history;

        return {
            itemId,
            found: true,
            dataPoints: history.length,
            history,
            stats: result.stats ? {
                minPrice: result.stats.min,
                maxPrice: result.stats.max,
                avgPrice: result.stats.avg,
                volatility: result.stats.volatility,
                trend: result.stats.trend,
                trendPercent: result.stats.trendPercent,
            } : undefined,
        };
    }

    /**
     * Get price history for multiple items efficiently
     */
    async getMultipleItemsHistory(
        itemIds: number[],
        options?: { startTime?: number; endTime?: number; timeRanges?: TimeRange[]; limit?: number }
    ): Promise<ItemHistoryResult[]> {
        await this.ensureInitialized();

        if (!this.reader) {
            return itemIds.map(itemId => ({ itemId, found: false, dataPoints: 0, history: [] }));
        }

        const results = await this.reader.queryItems({
            itemIds,
            startTime: options?.startTime,
            endTime: options?.endTime,
            timeRanges: options?.timeRanges,
            limit: options?.limit
        });

        // Map to service result format
        return results.map(r => ({
            itemId: r.itemId,
            found: true,
            dataPoints: r.history.length,
            history: r.history,
            stats: r.stats ? {
                minPrice: r.stats.min,
                maxPrice: r.stats.max,
                avgPrice: r.stats.avg,
                volatility: r.stats.volatility,
                trend: r.stats.trend,
                trendPercent: r.stats.trendPercent,
            } : undefined
        }));
    }

    /**
     * Get history for loose/sparse time ranges (e.g. 2015, 2017, 2024)
     */
    async getItemHistorySparse(
        itemId: number,
        timeRanges: TimeRange[]
    ): Promise<ItemHistoryResult> {
        const results = await this.getMultipleItemsHistory([itemId], { timeRanges });
        return results[0];
    }


    /**
     * Get the most recent snapshot available
     */
    async getLatestSnapshot(): Promise<SnapshotResult> {
        console.log('[GICS] getLatestSnapshot() called');
        await this.ensureInitialized();

        if (!this.reader) {
            console.log('[GICS] ❌ No reader available');
            return { timestamp: 0, found: false, itemCount: 0, items: [] };
        }

        const snapshot = await this.reader.getLatestSnapshot();
        if (!snapshot) {
            console.log('[GICS] ❌ No snapshot found from reader');
            return { timestamp: 0, found: false, itemCount: 0, items: [] };
        }

        console.log(`[GICS] ✅ Snapshot found: ${snapshot.items.size} items, timestamp: ${snapshot.timestamp}`);

        const items: SnapshotResult['items'] = [];
        for (const [itemId, data] of snapshot.items) {
            items.push({ itemId, price: data.price, quantity: data.quantity });
        }

        // Log sample of Bismuth items for debugging
        const bismuth1 = items.find(i => i.itemId === 210930);
        if (bismuth1) {
            console.log(`[GICS] Sample - Bismuth ★ (210930): price=${bismuth1.price}, qty=${bismuth1.quantity}`);
        }

        return {
            timestamp: snapshot.timestamp,
            found: true,
            itemCount: items.length,
            items,
        };
    }

    /**
     * Get snapshot at a specific timestamp
     * 
     * @example
     * const snapshot = await gics.getSnapshot(Date.now());
     * // Returns: { timestamp, found, itemCount, items }
     */
    async getSnapshot(timestamp?: number): Promise<SnapshotResult> {
        await this.ensureInitialized();

        const ts = timestamp ?? Math.floor(Date.now() / 1000);

        if (!this.reader) {
            return { timestamp: ts, found: false, itemCount: 0, items: [] };
        }

        const snapshot = await this.reader.getSnapshotAt(ts);

        if (!snapshot) {
            return { timestamp: ts, found: false, itemCount: 0, items: [] };
        }

        const items: SnapshotResult['items'] = [];
        for (const [itemId, data] of snapshot.items) {
            items.push({ itemId, price: data.price, quantity: data.quantity });
        }

        return {
            timestamp: snapshot.timestamp,
            found: true,
            itemCount: items.length,
            items,
        };
    }


    /**
     * Get market intelligence summary
     * 
     * @example
     * const intel = await gics.getMarketIntelligence();
     * // Returns: { hotItems, topGainers, topLosers, marketSentiment, ... }
     */
    async getMarketIntelligence(): Promise<MarketIntelResult> {
        await this.ensureInitialized();

        const emptyResult: MarketIntelResult = {
            timestamp: Date.now(),
            totalItems: 0,
            hotItems: [],
            warmItems: 0,
            coldItems: 0,
            topGainers: [],
            topLosers: [],
            marketSentiment: 'neutral',
            avgVolatility: 0,
        };

        if (!this.reader) {
            return emptyResult;
        }

        try {
            // Get tier summary from existing MarketIntelligence class
            const intel = new MarketIntelligence(this.reader);
            const summary = await intel.getMarketSummary();

            // Get all item IDs
            const itemIds = this.reader.getItemIds();
            if (itemIds.length === 0) {
                return { ...emptyResult, totalItems: 0 };
            }

            // Query recent history for trend analysis (last 48h for better sampling)
            const now = Math.floor(Date.now() / 1000);
            const twoDaysAgo = now - (48 * 60 * 60);

            const results = await this.reader.queryItems({
                itemIds: itemIds.slice(0, 500), // Limit for performance
                startTime: twoDaysAgo,
                endTime: now,
            });

            // Analyze each item
            interface ItemAnalysis {
                itemId: number;
                volatility: number;
                trend: 'up' | 'down' | 'stable';
                trendPercent: number;
                currentPrice: number;
                previousPrice: number;
            }

            const analyses: ItemAnalysis[] = [];
            let totalVolatility = 0;
            let upCount = 0;
            let downCount = 0;

            for (const result of results) {
                if (!result.stats || result.history.length < 2) continue;

                const currentPrice = result.history[result.history.length - 1]?.price ?? 0;
                const previousPrice = result.history[0]?.price ?? currentPrice;

                analyses.push({
                    itemId: result.itemId,
                    volatility: result.stats.volatility,
                    trend: result.stats.trend,
                    trendPercent: result.stats.trendPercent,
                    currentPrice,
                    previousPrice,
                });

                totalVolatility += result.stats.volatility;
                if (result.stats.trend === 'up') upCount++;
                else if (result.stats.trend === 'down') downCount++;
            }

            // Sort for top movers
            const sorted = [...analyses].sort((a, b) => b.trendPercent - a.trendPercent);

            // Top Gainers: Items with highest positive trend
            const topGainers = sorted
                .filter(a => a.trendPercent > 0)
                .slice(0, 10)
                .map(a => ({
                    itemId: a.itemId,
                    changePercent: Math.round(a.trendPercent * 100) / 100,
                    currentPrice: a.currentPrice,
                    previousPrice: a.previousPrice,
                }));

            // Top Losers: Items with highest negative trend
            const topLosers = sorted
                .filter(a => a.trendPercent < 0)
                .slice(-10)
                .reverse()
                .map(a => ({
                    itemId: a.itemId,
                    changePercent: Math.round(a.trendPercent * 100) / 100,
                    currentPrice: a.currentPrice,
                    previousPrice: a.previousPrice,
                }));

            // Hot Items: High volatility items with their real stats
            const hotItems = analyses
                .filter(a => a.volatility > 0.15) // >15% volatility = hot
                .sort((a, b) => b.volatility - a.volatility)
                .slice(0, 10)
                .map(a => ({
                    itemId: a.itemId,
                    volatility: Math.round(a.volatility * 1000) / 1000,
                    trend: a.trend,
                    trendPercent: Math.round(a.trendPercent * 100) / 100,
                }));

            // Calculate market sentiment
            const totalAnalyzed = upCount + downCount;
            let marketSentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile' = 'neutral';
            const avgVolatility = analyses.length > 0 ? totalVolatility / analyses.length : 0;

            if (avgVolatility > 0.3) {
                marketSentiment = 'volatile';
            } else if (totalAnalyzed > 0) {
                const upRatio = upCount / totalAnalyzed;
                if (upRatio > 0.6) marketSentiment = 'bullish';
                else if (upRatio < 0.4) marketSentiment = 'bearish';
            }

            return {
                timestamp: Date.now(),
                totalItems: summary.totalItems,
                hotItems,
                warmItems: summary.warmItemCount,
                coldItems: summary.coldItemCount,
                topGainers,
                topLosers,
                marketSentiment,
                avgVolatility: Math.round(avgVolatility * 1000) / 1000,
            };
        } catch (error) {
            console.error('[GICS] getMarketIntelligence error:', error);
            return emptyResult;
        }
    }

    /**
     * Get list of all tracked item IDs
     */
    async getItemIds(): Promise<number[]> {
        await this.ensureInitialized();
        return this.reader?.getItemIds() ?? [];
    }

    /**
     * Get tier classification for an item
     */
    async getItemTier(itemId: number): Promise<'hot' | 'warm' | 'cold' | null> {
        await this.ensureInitialized();
        return this.reader?.getItemTier(itemId) ?? null;
    }

    // ========================================================================
    // Write API
    // ========================================================================

    /**
     * Add a new snapshot to the database
     */
    async addSnapshot(snapshot: Snapshot): Promise<void> {
        if (!this.writer) {
            this.writer = new HybridWriter({ blockDurationDays: 7 });
        }
        await this.writer.addSnapshot(snapshot);
        this.pendingSnapshots.push(snapshot);
    }

    /**
     * Save all pending data to disk
     */
    async save(): Promise<{ filename: string; size: number }> {
        if (!this.writer || this.pendingSnapshots.length === 0) {
            return { filename: '', size: 0 };
        }

        const filename = this.getCurrentFilename();
        const compressed = await this.writer.finish();

        // Ensure directory exists
        if (!existsSync(this.config.dataDir)) {
            mkdirSync(this.config.dataDir, { recursive: true });
        }

        writeFileSync(filename, compressed);

        // Reset writer for next batch
        this.writer = new HybridWriter({ blockDurationDays: 7 });
        this.pendingSnapshots = [];

        // Reload reader with new data
        await this.loadLatestFile();

        return { filename, size: compressed.length };
    }

    /**
     * Ingest raw auction data from RealtimeMonitor
     */
    async ingest(rawData: Array<{ ts: string; item_id: number; price: number; qty: number }>): Promise<void> {
        if (!rawData || rawData.length === 0) return;

        // Convert raw array to GICS Snapshot format (Map)
        const timestamp = Math.floor(new Date(rawData[0].ts).getTime() / 1000);
        const items = new Map<number, { price: number; quantity: number }>();

        for (const row of rawData) {
            items.set(row.item_id, {
                price: row.price,
                quantity: row.qty
            });
        }

        // Add to internal writer
        await this.addSnapshot({
            timestamp,
            items
        });

        // Auto-save logic (save if > 10 pending snapshots or 5 minutes passed)
        // For production, we might want a more sophisticated strategy
        if (this.pendingSnapshots.length >= 10) {
            await this.save();
        }
    }

    // ========================================================================
    // Status & Management
    // ========================================================================

    /**
     * Get service status
     */
    async getStatus(): Promise<{
        initialized: boolean;
        dataDir: string;
        realmId: number;
        currentFile: string | null;
        hasData: boolean;
        itemCount: number;
        hasCorruption: boolean;
        corruptedBlocks: number[];
    }> {
        await this.ensureInitialized();

        return {
            initialized: this.initialized,
            dataDir: this.config.dataDir,
            realmId: this.config.realmId,
            currentFile: this.lastLoadedFile,
            hasData: this.reader !== null,
            itemCount: this.reader?.getItemIds().length ?? 0,
            hasCorruption: this.reader?.hasCorruption() ?? false,
            corruptedBlocks: this.reader?.getCorruptedBlocks() ?? [],
        };
    }

    /**
     * Force reload from disk
     */
    async reload(): Promise<void> {
        this.initialized = false;
        this.reader = null;
        await this.ensureInitialized();
    }

    // ========================================================================
    // Internal
    // ========================================================================

    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return;
        await this.loadLatestFile();
        this.initialized = true;
    }

    private async loadLatestFile(): Promise<void> {
        if (!existsSync(this.config.dataDir)) {
            console.log('[GICS] Data directory not found:', this.config.dataDir);
            this.reader = null;
            return;
        }

        // Cargar CUALQUIER archivo .gics, priorizando los del realm específico
        const allFiles = readdirSync(this.config.dataDir)
            .filter(f => f.endsWith('.gics') && !f.endsWith('.last'));

        // Ordenar: primero los del realm específico, luego por fecha desc
        const files = allFiles
            .sort((a, b) => {
                const aHasRealm = a.includes(`realm_${this.config.realmId}`);
                const bHasRealm = b.includes(`realm_${this.config.realmId}`);
                if (aHasRealm && !bHasRealm) return -1;
                if (!aHasRealm && bHasRealm) return 1;
                return b.localeCompare(a); // Más reciente primero
            });

        console.log(`[GICS] Found ${files.length} .gics files:`, files);

        if (files.length === 0) {
            this.reader = null;
            return;
        }

        // Intentar cargar el primero que funcione
        for (const file of files) {
            const fullPath = join(this.config.dataDir, file);
            try {
                const data = readFileSync(fullPath);
                const options: HybridReaderOptions = { salvageMode: this.config.salvageMode };
                this.reader = new HybridReader(new Uint8Array(data), options);
                this.lastLoadedFile = fullPath;
                console.log(`[GICS] ✅ Loaded ${file} (${this.reader.getItemIds().length} items)`);
                return;
            } catch (error) {
                console.error(`[GICS] Failed to load ${file}:`, error);
            }
        }

        this.reader = null;
    }

    private getCurrentFilename(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return join(this.config.dataDir, `realm_${this.config.realmId}_${year}-${month}.gics`);
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default GICS service instance - ready to use
 * 
 * @example
 * import { gics } from './gics-service';
 * const history = await gics.getItemHistory(12345);
 */
export const gics = new GICSService();

/**
 * Create a custom GICS service with specific config
 */
export function createGICSService(config?: GICSServiceConfig): GICSService {
    return new GICSService(config);
}



export type { TimeRange };
export { GICSService };
