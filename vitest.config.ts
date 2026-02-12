
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.{test,spec}.ts'],
        environment: 'node',
        globals: true,
        setupFiles: ['tests/setup.global.ts'],
        reporters: ['default', 'junit'],
        outputFile: {
            junit: 'reports/vitest-junit.xml'
        },
        coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage',
            reporter: ['text', 'lcov', 'json-summary'],
            include: ['src/**/*.ts'],
            exclude: ['**/*.d.ts', 'src/zstd-codec.d.ts']
        }
    },
});
