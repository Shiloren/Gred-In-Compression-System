import { beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
process.on('unhandledRejection', (reason: unknown) => {
  console.error('UNHANDLED_REJECTION', reason);
});
process.on('uncaughtException', (err: Error) => {
  console.error('UNCAUGHT_EXCEPTION', err);
});

// GLOBAL TEST SANDBOX & NETWORK BLOCKING
const blockMsg = 'â›” NETWORK BLOCKED: Unit tests must not access external resources. Use vi.spyOn() or mocks.';

// Mock http/https modules
vi.mock('http', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof import('http')>)();
  return {
    ...actual,
    request: () => { throw new Error(blockMsg); },
    get: () => { throw new Error(blockMsg); }
  };
});

vi.mock('https', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof import('https')>)();
  return {
    ...actual,
    request: () => { throw new Error(blockMsg); },
    get: () => { throw new Error(blockMsg); }
  };
});

// Block fetch
global.fetch = async () => { throw new Error(blockMsg); };


// 1. Setup Data Sandbox (Global & Synchronous to catch imports)
const testDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gred-test-env-'));
process.env.DATA_ROOT = testDataRoot;

// Create necessary subdirectories to avoid ENOENT in naive tests
fs.mkdirSync(path.join(testDataRoot, 'gics'), { recursive: true });
fs.mkdirSync(path.join(testDataRoot, 'logs'), { recursive: true });

// 2. Block Disk Leaks (Hermeticity - Passive Check)
const forbiddenDataDir = path.resolve(process.cwd(), 'node', 'data');
(global as any).__initialDataHash = getDirHash(forbiddenDataDir);

beforeAll(async () => {
  // any async setup if needed
});

function getDirHash(dirP: string): string {
  if (!fs.existsSync(dirP)) return 'missing';
  const hash = crypto.createHash('sha256');

  try {
    function walk(d: string) {
      const entries = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const p = path.join(d, entry.name);
        hash.update(entry.name);
        if (entry.isDirectory()) {
          walk(p);
        } else {
          const stat = fs.statSync(p);
          hash.update(String(stat.mtimeMs));
          hash.update(String(stat.size));
        }
      }
    }
    walk(dirP);
  } catch (e) {
    return 'error-' + String(e); // directory might be deleted/locked
  }
  return hash.digest('hex');
}

afterAll(async () => {
  // Hermeticity Check
  const forbiddenDataDir = path.resolve(process.cwd(), 'node', 'data');
  const finalHash = getDirHash(forbiddenDataDir);
  if ((global as any).__initialDataHash !== finalHash) {
    console.error('â›” DISK LEAK DETECTED: Tests modified files in ./node/data. This violates hermeticity.');
    // We throw to fail the test suite
    throw new Error('â›” DISK LEAK DETECTED: Tests modified files in ./node/data. This violates hermeticity.');
  }

  if (testDataRoot) {
    // Cleanup sandbox
    try {
      await fs.promises.rm(testDataRoot, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to cleanup test sandbox', e);
    }
  }
});

// Patch global dynamic import for app/router .js resolution in test (map .js -> .ts when source file exists)
const Module = (global as any).Module;
(global as any).getBuildApp = async () => {
  const m = await import('../../src/server/app.js').catch(async () => import('../../src/server/app.js'));
  const builder = m.buildApp || m.createApp;
  return await builder();
};
console.log('GLOBAL SETUP LOADED');


