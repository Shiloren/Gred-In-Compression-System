import fs from 'fs';
import path from 'path';
const resultsDir = path.join(process.cwd(), 'bench/results');
const reportFile = path.join(process.cwd(), 'bench/sensitive/report.md');
function main() {
    if (!fs.existsSync(resultsDir))
        return;
    const files = fs.readdirSync(resultsDir).filter(f => f.startsWith('sensitive-') && f.endsWith('.json'));
    if (files.length === 0) {
        console.log('No sensitive results.');
        return;
    }
    const latestFile = files.sort().pop();
    const data = JSON.parse(fs.readFileSync(path.join(resultsDir, latestFile), 'utf-8'));
    const lines = [];
    lines.push('# Ultra-Sensitive GICS Benchmark Report (Zero-Entropy Patch)');
    lines.push(`**Run ID**: ${latestFile}`);
    lines.push(`**Date**: ${new Date().toISOString()}\n`);
    const families = ['A', 'B', 'C', 'D'];
    const titles = {
        'A': 'Family A: Chunk Size Sweep',
        'B': 'Family B: Append Continuity',
        'C': 'Family C: Structural Perturbation',
        'D': 'Family D: Field Isolation'
    };
    for (const fam of families) {
        lines.push(`## ${titles[fam]}`);
        const familyRows = data.filter((r) => r.family === fam);
        if (familyRows.length === 0)
            continue;
        lines.push('| Variant | Mode | CtxID | AppMode | Ratio (x) | p50 (ms) | p90 (ms) | Output (Bytes) | Δ Bytes (OFF-ON) |');
        lines.push('|---|---|---|---|---|---|---|---|---|');
        const variants = Array.from(new Set(familyRows.map((r) => r.variant.replace(/_(OFF|ON)$/, ''))));
        for (const base of variants) {
            const off = familyRows.find((r) => r.variant === `${base}_OFF`);
            const on = familyRows.find((r) => r.variant === `${base}_ON`);
            if (off)
                lines.push(formatRow(base, 'OFF', off));
            if (on)
                lines.push(formatRow(base, 'ON', on));
            if (off && on) {
                const dRatio = on.metrics.ratio_x - off.metrics.ratio_x;
                // Use p50 for time comparison
                const tOff = off.metrics.encode_p50_ms || off.metrics.time_encode_ms;
                const tOn = on.metrics.encode_p50_ms || on.metrics.time_encode_ms;
                const dTime = tOn - tOff;
                const dBytes = off.metrics.output_bytes - on.metrics.output_bytes; // Positive = Saving
                const dBytesStr = dBytes > 0 ? `+${dBytes}` : `${dBytes}`;
                const dRatioStr = dRatio > 0 ? `+${dRatio.toFixed(2)}` : `${dRatio.toFixed(2)}`;
                const dTimeStr = dTime > 0 ? `+${dTime.toFixed(2)}` : `${dTime.toFixed(2)}`;
                lines.push(`| **DELTA** | A/B | - | - | **${dRatioStr}** | ${dTimeStr} | - | ${dBytesStr} | **${dBytesStr}** |`);
            }
        }
        lines.push('');
    }
    fs.writeFileSync(reportFile, lines.join('\n'));
    console.log(`Generated ${reportFile}`);
}
function formatRow(base, mode, r) {
    const ctxId = r.context_id ? `\`${r.context_id}\`` : 'NULL';
    const appMode = r.append_mode || '-';
    const p50 = (r.metrics.encode_p50_ms || r.metrics.time_encode_ms).toFixed(2);
    const p90 = (r.metrics.encode_p90_ms || 0).toFixed(2);
    return `| ${base} | ${mode} | ${ctxId} | ${appMode} | ${r.metrics.ratio_x.toFixed(2)} | ${p50} | ${p90} | ${r.metrics.output_bytes} | - |`;
}
main();
