import * as fs from 'fs/promises';
import { wait } from '../gics-utils.js';

/**
 * Lock mode supported by the daemon.
 */
export type FileLockMode = 'shared' | 'exclusive';

export class FileLockTimeoutError extends Error {
    constructor(filePath: string, mode: FileLockMode, timeoutMs: number) {
        super(`Failed to acquire ${mode} lock for ${filePath} within ${timeoutMs}ms.`);
        this.name = 'FileLockTimeoutError';
    }
}

/**
 * Atomic file locking for cross-platform environments (Node stdlib only).
 *
 * Design:
 * - Exclusive lock: marker file `${target}.locks/exclusive.lock`
 * - Shared lock: one marker file per holder `${target}.locks/shared-*.lock`
 *
 * This provides portable shared/exclusive semantics without external dependencies.
 * It is intentionally conservative and retries until timeout.
 */
export class FileLock {
    private readonly targetFilePath: string;
    private readonly lockDirPath: string;
    private readonly exclusiveLockPath: string;
    private heldMode: FileLockMode | null = null;
    private sharedLockPath: string | null = null;

    constructor(targetFilePath: string) {
        this.targetFilePath = targetFilePath;
        this.lockDirPath = `${targetFilePath}.locks`;
        this.exclusiveLockPath = `${this.lockDirPath}/exclusive.lock`;
    }

    private async ensureLockDir(): Promise<void> {
        await fs.mkdir(this.lockDirPath, { recursive: true });
    }

    private async writeLockFile(filePath: string, metadata: Record<string, string | number>): Promise<void> {
        const lockPayload = JSON.stringify(metadata);
        const handle = await fs.open(filePath, 'wx');
        try {
            await handle.writeFile(lockPayload, 'utf8');
        } finally {
            await handle.close();
        }
    }

    private async getSharedLockFiles(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.lockDirPath);
            return files.filter((name) => name.startsWith('shared-') && name.endsWith('.lock'));
        } catch (err: any) {
            if (err.code === 'ENOENT') return [];
            throw err;
        }
    }

    private async existsExclusiveLock(): Promise<boolean> {
        try {
            await fs.access(this.exclusiveLockPath);
            return true;
        } catch (err: any) {
            if (err.code === 'ENOENT') return false;
            throw err;
        }
    }

    private async tryAcquireShared(): Promise<boolean> {
        // Fast check: shared lock cannot be acquired while exclusive exists.
        if (await this.existsExclusiveLock()) {
            return false;
        }

        await this.ensureLockDir();
        const candidatePath = `${this.lockDirPath}/shared-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.lock`;

        try {
            await this.writeLockFile(candidatePath, {
                mode: 'shared',
                pid: process.pid,
                acquiredAt: Date.now()
            });
        } catch (err: any) {
            if (err.code === 'EEXIST') {
                return false;
            }
            throw err;
        }

        // Re-check after creation to close race with exclusive acquirer.
        if (await this.existsExclusiveLock()) {
            await fs.unlink(candidatePath).catch(() => undefined);
            return false;
        }

        this.heldMode = 'shared';
        this.sharedLockPath = candidatePath;
        return true;
    }

    private async tryAcquireExclusive(): Promise<boolean> {
        await this.ensureLockDir();

        try {
            await this.writeLockFile(this.exclusiveLockPath, {
                mode: 'exclusive',
                pid: process.pid,
                acquiredAt: Date.now()
            });
        } catch (err: any) {
            if (err.code === 'EEXIST') {
                return false;
            }
            throw err;
        }

        // Re-check shared readers to close race windows.
        const sharedFiles = await this.getSharedLockFiles();
        if (sharedFiles.length > 0) {
            await fs.unlink(this.exclusiveLockPath).catch(() => undefined);
            return false;
        }

        this.heldMode = 'exclusive';
        this.sharedLockPath = null;
        return true;
    }

    /**
     * Acquire a lock with timeout/retry policy.
     */
    async acquire(mode: FileLockMode, timeoutMs: number = 5000, retryIntervalMs: number = 100): Promise<void> {
        if (this.heldMode) {
            throw new Error(`Lock for ${this.targetFilePath} is already held in mode=${this.heldMode}.`);
        }

        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const acquired = mode === 'shared'
                ? await this.tryAcquireShared()
                : await this.tryAcquireExclusive();

            if (acquired) {
                return;
            }

            await wait(retryIntervalMs);
        }

        throw new FileLockTimeoutError(this.targetFilePath, mode, timeoutMs);
    }

    /**
     * Release the lock.
     */
    async release(): Promise<void> {
        if (this.heldMode === 'exclusive') {
            try {
                await fs.unlink(this.exclusiveLockPath);
            } catch (err: any) {
                if (err.code !== 'ENOENT') throw err;
            }
        } else if (this.heldMode === 'shared' && this.sharedLockPath) {
            try {
                await fs.unlink(this.sharedLockPath);
            } catch (err: any) {
                if (err.code !== 'ENOENT') throw err;
            }
        }

        this.heldMode = null;
        this.sharedLockPath = null;
    }

    /**
     * Execute a function with an exclusive lock.
     */
    static async withExclusiveLock<T>(filePath: string, fn: () => Promise<T>, timeoutMs: number = 5000): Promise<T> {
        const lock = new FileLock(filePath);
        await lock.acquire('exclusive', timeoutMs);
        try {
            return await fn();
        } finally {
            await lock.release();
        }
    }

    /**
     * Execute a function with a shared lock.
     */
    static async withSharedLock<T>(filePath: string, fn: () => Promise<T>, timeoutMs: number = 5000): Promise<T> {
        const lock = new FileLock(filePath);
        await lock.acquire('shared', timeoutMs);
        try {
            return await fn();
        } finally {
            await lock.release();
        }
    }

    /**
     * Backward-compatible alias for existing call sites.
     */
    static async withLock<T>(filePath: string, fn: () => Promise<T>, timeoutMs: number = 5000): Promise<T> {
        return FileLock.withExclusiveLock(filePath, fn, timeoutMs);
    }
}
