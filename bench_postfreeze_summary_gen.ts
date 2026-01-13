
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = path.join(process.cwd(), 'bench_postfreeze_artifacts');
const RUN_A = path.join(ARTIFACTS_DIR, 'runA');
const RUN_B = path.join(ARTIFACTS_DIR, 'runB');

const datasets = ['Structured_TrendNoise', 'Mixed_RegimeSwitch', 'HighEntropy_Random'];

const summary: any = {
    timestamp: new Date().toISOString(),
    datasets: {}
};

datasets.forEach(ds => {
    // KPI
    const kpiPath = path.join(RUN_A, `${ds}_kpi.json`);
    const kpi = JSON.parse(fs.readFileSync(kpiPath, 'utf-8'));

    // Impact
    const impactPath = path.join(RUN_A, `${ds}_impact.json`);
    const impact = JSON.parse(fs.readFileSync(impactPath, 'utf-8'));

    // SHA
    const shaPath = path.join(RUN_A, `${ds}_encoded.sha256`);
    const sha = fs.readFileSync(shaPath, 'utf-8').trim();

    summary.datasets[ds] = {
        core_ratio: kpi.core_ratio,
        global_ratio: kpi.global_ratio,
        quarantine_byte_rate: impact.quarantine_byte_rate,
        quarantine_block_rate: impact.quarantine_block_rate,
        encoded_sha256: sha
    };
});


fs.writeFileSync('bench_postfreeze_summary.json', JSON.stringify(summary, null, 2));
console.log("Summary written to bench_postfreeze_summary.json");

