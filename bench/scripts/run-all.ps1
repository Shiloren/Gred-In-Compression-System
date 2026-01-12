
# Minimal runner that assumes TS environment
# Tries npx tsx first, falls back to tsc

if (Get-Command "npx" -ErrorAction SilentlyContinue) {
    Write-Host "Running Benchmarks via npx tsx..."
    $env:NODE_OPTIONS = "--max-old-space-size=4096"
    npx tsx bench/scripts/harness.ts
    npx tsx bench/scripts/gen-report.ts
}
else {
    Write-Error "Node/NPM not found. Please install Node.js."
    exit 1
}
