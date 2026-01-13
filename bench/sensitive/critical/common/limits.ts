/**
 * HARD LIMITS for GICS Critical Gate.
 * These act as the "Laws of Physics" for the decoder under test.
 */
export const CRITICAL_LIMITS = {
    // Max size of a single encoded block (Header + Payload)
    // Helps catch "huge block" allocation attacks.
    MAX_BLOCK_BYTES: 10 * 1024 * 1024, // 10MB

    // Max number of points in a single block (sanity check)
    MAX_POINTS_PER_BLOCK: 1_000_000,

    // Max length of a variable-length integer (Varint)
    // 64-bit varints approx 10 bytes max.
    MAX_VARINT_BYTES: 10,

    // Max total output size for a single decode operation in the suite
    MAX_OUTPUT_BYTES: 1 * 1024 * 1024 * 1024, // 1GB

    // Timeout for individual critical tests (ms)
    TEST_TIMEOUT_MS: 30_000, // 30s

    // Timeout for Fuzzing iterations
    FUZZ_TIMEOUT_MS: 5_000,
};
