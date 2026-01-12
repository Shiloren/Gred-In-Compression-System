const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = path.join(process.cwd(), 'audit_artifacts');
console.log('--- DIR LIST ---');
if (fs.existsSync(dir)) {
    // Check for nested audit_artifacts
    const items = fs.readdirSync(dir);
    items.forEach(f => {
        const stats = fs.statSync(path.join(dir, f));
        console.log(f + (stats.isDirectory() ? '/' : ''));
        if (stats.isDirectory()) {
            fs.readdirSync(path.join(dir, f)).forEach(sub => console.log('  ' + sub));
        }
    });
} else {
    console.log('audit_artifacts dir missing');
}

try {
    // Try to find context file
    let ctxPath = path.join(dir, 'ValidVolatile_context.json');
    if (!fs.existsSync(ctxPath)) {
        ctxPath = path.join(dir, 'audit_artifacts', 'ValidVolatile_context.json');
    }

    if (fs.existsSync(ctxPath)) {
        const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
        console.log('--- RUN ID ---');
        console.log(ctx.run_id);
    } else {
        console.log('--- NO CONTEXT FILE FOUND ---');
    }
} catch (e) {
    console.log(e.message);
}

// Hashes
const zipA = path.join(process.cwd(), 'audit_artifacts_split5.2_runA.zip');
const zipB = path.join(process.cwd(), 'audit_artifacts_split5.2_runB.zip');

function getHash(f) {
    if (!fs.existsSync(f)) return 'MISSING';
    const buf = fs.readFileSync(f);
    return crypto.createHash('sha256').update(buf).digest('hex');
}
console.log(`Hash A: ${getHash(zipA)}`);
console.log(`Hash B: ${getHash(zipB)}`);
