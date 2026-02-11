import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { GICS } from '../../src/index.js';

type BenchmarkReport = {
    runId: string;
    timestampUtc: string;
    thresholdRatioX: number;
    targetRawBytes: number;
    environment: {
        node: string;
        os: string;
        cpu: string;
        gitCommit: string;
    };
    generation: {
        snapshotsGenerated: number;
        rawBytesGenerated: number;
        itemCountPerSnapshot: number;
    };
    gics: {
        compressedBytes: number;
        ratioX: number;
        encodeMs: number;
        verifyIntegrityOnly: boolean;
        fullDecodeEnabled: boolean;
        fullDecodeSnapshotCount?: number;
    };
    summary: {
        pass: boolean;
        failReasons: string[];
    };
};

function getGitCommit(): string {
    try {
        return execSync('git rev-parse HEAD').toString().trim();
    } catch {
        return 'unknown';
    }
}

function buildSnapshot(index: number, itemCount: number): { timestamp: number; items: Map<number, { price: number; quantity: number }> } {
    const baseTs = 1_700_000_000_000;
    const items = new Map<number, { price: number; quantity: number }>();
    const regime = index % 64;
    for (let i = 0; i < itemCount; i++) {
        const id = 1000 + i;
        const bucket = i % 8;
        const price = 100_000 + bucket * 100 + regime;
        const quantity = (bucket % 3) + 1;
        items.set(id, { price, quantity });
    }
    return { timestamp: baseTs + index, items };
}

function estimateRawSnapshotBytes(snapshot: { timestamp: number; items: Map<number, { price: number; quantity: number }> }): number {
    const plain = {
        timestamp: snapshot.timestamp,
        items: Array.from(snapshot.items.entries()).map(([id, v]) => ({ id, price: v.price, quantity: v.quantity })),
    };
    return Buffer.byteLength(JSON.stringify(plain) + '\n');
}

function renderMarkdown(report: BenchmarkReport): string {
    const lines: string[] = [];
    lines.push('# GICS Rigorous 1GB Benchmark Report');
    lines.push(`- Run: ${report.runId}`);
    lines.push(`- Timestamp: ${report.timestampUtc}`);
    lines.push(`- Target raw bytes: ${report.targetRawBytes}`);
    lines.push(`- Threshold ratio: ${report.thresholdRatioX}x`);
    lines.push(`- Pass: ${report.summary.pass ? 'YES' : 'NO'}`);
    lines.push('');
    lines.push('## Generation');
    lines.push(`- Snapshots generated: ${report.generation.snapshotsGenerated}`);
    lines.push(`- Raw bytes generated: ${report.generation.rawBytesGenerated}`);
    lines.push(`- Items per snapshot: ${report.generation.itemCountPerSnapshot}`);
    lines.push('');
    lines.push('## GICS');
    lines.push(`- Compressed bytes: ${report.gics.compressedBytes}`);
    lines.push(`- Ratio: ${report.gics.ratioX.toFixed(2)}x`);
    lines.push(`- Encode ms: ${report.gics.encodeMs.toFixed(2)}`);
    lines.push(`- Integrity verify: ${report.gics.verifyIntegrityOnly}`);
    lines.push(`- Full decode enabled: ${report.gics.fullDecodeEnabled}`);
    if (report.gics.fullDecodeSnapshotCount !== undefined) {
        lines.push(`- Full decode snapshot count: ${report.gics.fullDecodeSnapshotCount}`);
    }
    if (report.summary.failReasons.length > 0) {
        lines.push('');
        lines.push('## Fail reasons');
        for (const reason of report.summary.failReasons) lines.push(`- ${reason}`);
    }
    return lines.join('\n');
}

async function main(): Promise<void> {
    const thresholdRatioX = Number(process.env.GICS_MIN_RATIO_X ?? '50');
    const targetRawBytes = Number(process.env.GICS_TARGET_RAW_BYTES ?? '1000000000'); // 1 GB
    const itemCountPerSnapshot = Number(process.env.GICS_BENCH_ITEMS_PER_SNAPSHOT ?? '24');
    const flushEverySnapshots = Number(process.env.GICS_BENCH_FLUSH_EVERY ?? '20000');
    const doFullDecode = process.env.GICS_FULL_DECODE === '1';

    const runId = `empirical-rigorous-${new Date().toISOString().replace(/[:.]/g, '-')}`;

    const encoder = new GICS.Encoder();
    let rawBytesGenerated = 0;
    let snapshotsGenerated = 0;
    const rawHasher = createHash('sha256');

    const t0 = performance.now();
    while (rawBytesGenerated < targetRawBytes) {
        const snap = buildSnapshot(snapshotsGenerated, itemCountPerSnapshot);
        await encoder.push(snap);

        const rawBytes = estimateRawSnapshotBytes(snap);
        rawBytesGenerated += rawBytes;
        rawHasher.update(String(rawBytes));
        rawHasher.update('|');

        snapshotsGenerated++;
        if (snapshotsGenerated % flushEverySnapshots === 0) {
            await encoder.flush();
        }
    }

    const packed = await encoder.seal();
    const t1 = performance.now();
    const verifyOk = await GICS.verify(packed);

    let fullDecodeSnapshotCount: number | undefined;
    if (doFullDecode) {
        const decoded = await GICS.unpack(packed);
        fullDecodeSnapshotCount = decoded.length;
    }

    const ratioX = rawBytesGenerated / Math.max(1, packed.length);
    const failReasons: string[] = [];
    if (rawBytesGenerated < targetRawBytes) {
        failReasons.push(`Raw bytes generated (${rawBytesGenerated}) < target (${targetRawBytes})`);
    }
    if (!verifyOk) {
        failReasons.push('GICS verifyIntegrityOnly returned false');
    }
    if (ratioX < thresholdRatioX) {
        failReasons.push(`Compression ratio ${ratioX.toFixed(2)}x < required ${thresholdRatioX.toFixed(2)}x`);
    }
    if (doFullDecode && fullDecodeSnapshotCount !== snapshotsGenerated) {
        failReasons.push(`Full decode count mismatch: expected ${snapshotsGenerated}, got ${fullDecodeSnapshotCount}`);
    }

    const report: BenchmarkReport = {
        runId,
        timestampUtc: new Date().toISOString(),
        thresholdRatioX,
        targetRawBytes,
        environment: {
            node: process.version,
            os: `${os.type()} ${os.release()}`,
            cpu: os.cpus()[0]?.model ?? 'unknown',
            gitCommit: getGitCommit(),
        },
        generation: {
            snapshotsGenerated,
            rawBytesGenerated,
            itemCountPerSnapshot,
        },
        gics: {
            compressedBytes: packed.length,
            ratioX,
            encodeMs: t1 - t0,
            verifyIntegrityOnly: verifyOk,
            fullDecodeEnabled: doFullDecode,
            fullDecodeSnapshotCount,
        },
        summary: {
            pass: failReasons.length === 0,
            failReasons,
        },
    };

    const latestDir = path.join(process.cwd(), 'bench', 'results', 'latest');
    fs.mkdirSync(latestDir, { recursive: true });
    fs.writeFileSync(path.join(latestDir, 'empirical-rigorous-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(latestDir, 'empirical-rigorous-report.md'), renderMarkdown(report));

    const archivePath = path.join(process.cwd(), 'bench', 'results', `${runId}.json`);
    fs.writeFileSync(archivePath, JSON.stringify(report, null, 2));

    console.log(`Rigorous report written to ${path.join(latestDir, 'empirical-rigorous-report.json')}`);
    console.log(`Raw generated: ${rawBytesGenerated} bytes (${(rawBytesGenerated / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Compressed: ${packed.length} bytes (${(packed.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Ratio: ${ratioX.toFixed(2)}x (threshold ${thresholdRatioX.toFixed(2)}x)`);

    if (!report.summary.pass) {
        console.error(`FAIL STATE: ${report.summary.failReasons.join(' | ')}`);
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
