import fs from 'fs';
import path from 'path';
const resultsDir = path.join(process.cwd(), 'bench/results');
const reportFile = path.join(process.cwd(), 'bench/report.md');
function main() {
    // 1. Read all JSONs
    if (!fs.existsSync(resultsDir))
        return;
    const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
        console.log('No results found.');
        return;
    }
    // Sort by time desc (use latest for now, or append table?)
    // Requirements: "gen-report reads all... produces report.md"
    // I'll take the LATEST run file for the main table, or aggregate.
    // Spec says "Every number... traceable to a result JSON".
    // I will generate a report for the *latest* run.
    const latestFile = files.sort().pop();
    const data = JSON.parse(fs.readFileSync(path.join(resultsDir, latestFile), 'utf-8'));
    const lines = [];
    lines.push('# GICS Benchmark Report');
    lines.push(`**Run ID**: ${latestFile}`);
    lines.push(`**Time**: ${data[0].timestamp_utc}`);
    lines.push(`**Environment**: ${data[0].cpu_model} / ${data[0].os_info}`);
    lines.push('');
    // Table
    lines.push('## Results');
    lines.push('| Dataset | System | Workload | Size (In) | Size (Out) | Ratio | Total (ms) | Setup (ms) | Encode (ms) | RAM (MB) |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of data) {
        const mb = (r.metrics.output_bytes / 1024 / 1024).toFixed(2);
        const inMb = (r.dataset.size / 1024 / 1024).toFixed(2);
        const setup = r.metrics.time_setup_ms !== undefined ? r.metrics.time_setup_ms.toFixed(1) : '-';
        const encode = r.metrics.time_encode_ms !== undefined ? r.metrics.time_encode_ms.toFixed(1) : '-';
        lines.push(`| ${r.dataset.name} | **${r.system}** | ${r.workload} | ${inMb} MB | ${mb} MB | **${r.metrics.ratio_x.toFixed(2)}x** | ${r.metrics.time_ms.toFixed(0)} | ${setup} | ${encode} | ${r.metrics.ram_peak_mb.toFixed(1)} |`);
    }
    fs.writeFileSync(reportFile, lines.join('\n'));
    console.log(`Generatred ${reportFile}`);
}
main();
