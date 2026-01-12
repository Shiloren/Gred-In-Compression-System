/**
 * GICS Sync Service
 * 
 * Automatically pulls GICS data from GitHub and reloads the GICS reader.
 * Includes anti-desync protections and staleness detection.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { statSync, readdirSync } from 'fs';
import { gics } from './gics-service.js';

const execAsync = promisify(exec);

// Configuration
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STALENESS_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const GICS_DATA_DIR = join(process.cwd(), 'data', 'gics');

interface SyncStatus {
    lastSync: Date | null;
    lastSyncSuccess: boolean;
    dataAge: number; // milliseconds
    isStale: boolean;
    error?: string;
}

class GICSSyncService {
    private lastSync: Date | null = null;
    private lastSyncSuccess = false;
    private lastError: string | undefined;
    private intervalId: NodeJS.Timeout | null = null;

    /**
     * Start the automatic sync scheduler
     */
    start(): void {
        if (this.intervalId) {
            console.log('[GICS-Sync] Already running');
            return;
        }

        console.log('[GICS-Sync] Starting automatic sync scheduler (every 1 hour)');

        // Initial sync after 5 seconds (give server time to start)
        setTimeout(() => this.sync(), 5000);

        // Schedule hourly sync
        this.intervalId = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
    }

    /**
     * Stop the automatic sync scheduler
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[GICS-Sync] Stopped automatic sync scheduler');
        }
    }

    /**
     * Perform a sync: git pull + reload GICS
     */
    async sync(): Promise<boolean> {
        console.log('[GICS-Sync] Starting sync...');

        try {
            // 1. Check for local uncommitted changes in data/gics/
            const hasLocalChanges = await this.hasUncommittedChanges();
            if (hasLocalChanges) {
                console.log('[GICS-Sync] ⚠️ Local uncommitted changes detected, skipping pull');
                this.lastError = 'Local uncommitted changes in data/gics/';
                return false;
            }

            // 2. Git pull only the GICS data files
            const pullResult = await this.gitPull();
            if (!pullResult.success) {
                console.log(`[GICS-Sync] ❌ Git pull failed: ${pullResult.error}`);
                this.lastError = pullResult.error;
                this.lastSyncSuccess = false;
                return false;
            }

            // 3. Reload GICS reader if files changed
            if (pullResult.filesChanged) {
                console.log('[GICS-Sync] 🔄 GICS files changed, reloading...');
                await gics.reload();
                console.log('[GICS-Sync] ✅ GICS reloaded successfully');
            } else {
                console.log('[GICS-Sync] ℹ️ No GICS changes, skipping reload');
            }

            this.lastSync = new Date();
            this.lastSyncSuccess = true;
            this.lastError = undefined;
            return true;

        } catch (error: any) {
            console.error('[GICS-Sync] ❌ Sync error:', error.message);
            this.lastError = error.message;
            this.lastSyncSuccess = false;
            return false;
        }
    }

    /**
     * Check if there are uncommitted changes in data/gics/
     */
    private async hasUncommittedChanges(): Promise<boolean> {
        try {
            const { stdout } = await execAsync('git status --porcelain data/gics/', {
                cwd: join(process.cwd(), '..')
            });
            return stdout.trim().length > 0;
        } catch {
            // If git fails, assume no changes to be safe
            return false;
        }
    }

    /**
     * Git pull origin main
     */
    private async gitPull(): Promise<{ success: boolean; filesChanged: boolean; error?: string }> {
        try {
            // Fetch first to check for changes
            await execAsync('git fetch origin main', {
                cwd: join(process.cwd(), '..')
            });

            // Check if there are changes to pull
            const { stdout: diffOutput } = await execAsync('git diff HEAD origin/main --name-only -- node/data/gics/', {
                cwd: join(process.cwd(), '..')
            });

            const filesChanged = diffOutput.trim().length > 0;

            if (filesChanged) {
                // Pull only if there are changes
                await execAsync('git pull origin main --no-rebase', {
                    cwd: join(process.cwd(), '..')
                });
            }

            return { success: true, filesChanged };

        } catch (error: any) {
            return { success: false, filesChanged: false, error: error.message };
        }
    }

    /**
     * Get the age of the latest GICS data file
     */
    getDataAge(): number {
        try {
            const files = readdirSync(GICS_DATA_DIR).filter(f => f.endsWith('.gics'));
            if (files.length === 0) return Infinity;

            let latestMtime = 0;
            for (const file of files) {
                const stat = statSync(join(GICS_DATA_DIR, file));
                if (stat.mtimeMs > latestMtime) {
                    latestMtime = stat.mtimeMs;
                }
            }

            return Date.now() - latestMtime;
        } catch {
            return Infinity;
        }
    }

    /**
     * Check if GICS data is stale (older than threshold)
     */
    isStale(): boolean {
        return this.getDataAge() > STALENESS_THRESHOLD_MS;
    }

    /**
     * Get current sync status for health checks
     */
    getStatus(): SyncStatus {
        const dataAge = this.getDataAge();
        return {
            lastSync: this.lastSync,
            lastSyncSuccess: this.lastSyncSuccess,
            dataAge,
            isStale: dataAge > STALENESS_THRESHOLD_MS,
            error: this.lastError
        };
    }
}

// Singleton instance
export const gicsSyncService = new GICSSyncService();
