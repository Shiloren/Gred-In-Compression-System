import fs from 'node:fs';
import path from 'node:path';

function readJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function approxEqual(a, b, eps = 1e-9) {
    return Math.abs(a - b) <= eps;
}

function main() {
    const reportPath = path.join(process.cwd(), 'bench', 'results', 'latest', 'empirical-report.json');
    if (!fs.existsSync(reportPath)) {
        throw new Error(`Missing report: ${reportPath}. Run 'npm run bench:empirical' first.`);
    }

    const report = readJson(reportPath);
    const failures = [];

    let criticalIn = 0;
    let criticalOut = 0;

    for (const d of report.datasets ?? []) {
        const calcGics = d.rawBytes / Math.max(1, d.gics.outputBytes);
        const calcZstd = d.rawBytes / Math.max(1, d.baselineZstd.outputBytes);

        if (!approxEqual(calcGics, d.gics.ratioX, 1e-9)) {
            failures.push(`${d.id}: gics.ratioX mismatch (reported=${d.gics.ratioX}, calc=${calcGics})`);
        }
        if (!approxEqual(calcZstd, d.baselineZstd.ratioX, 1e-9)) {
            failures.push(`${d.id}: baselineZstd.ratioX mismatch (reported=${d.baselineZstd.ratioX}, calc=${calcZstd})`);
        }

        if (d.category === 'critical') {
            criticalIn += d.rawBytes;
            criticalOut += d.gics.outputBytes;
        }
    }

    const weighted = criticalIn / Math.max(1, criticalOut);
    const reportedWeighted = report.summary?.weightedRatioCriticalGics ?? 0;
    if (!approxEqual(weighted, reportedWeighted, 1e-9)) {
        failures.push(`summary.weightedRatioCriticalGics mismatch (reported=${reportedWeighted}, calc=${weighted})`);
    }

    if (failures.length > 0) {
        throw new Error(`Compression report validation failed:\n- ${failures.join('\n- ')}`);
    }

    console.log('Compression report validation: OK');
    console.log(`Weighted critical ratio: ${weighted.toFixed(6)}x`);
}

try {
    main();
} catch (e) {
    console.error(e?.stack ?? String(e));
    process.exit(1);
}
