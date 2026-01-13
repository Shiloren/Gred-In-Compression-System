export * from './gics-types.js';
export * from './gics-utils.js';
export * from './gics-canonical.js';
// v1.2 Agnostic Engine
export { GICSv2Engine } from './gics/v1_2/encode.js';
export { GICSv2Decoder as GICSv2AgnosticDecoder } from './gics/v1_2/decode.js';
// v1.2 Legacy Wrapper (Snapshot API)
export { GICSv2Encoder, GICSv2Decoder } from './gics/v1_2/legacy-wrapper.js';
// v1.1 Frozen
export { gics11_encode, gics11_decode } from '../gics_frozen/v1_1_0/index.js';
// Default Router (keeps legacy behavior)
// We might need to implement a default router that inspects version or uses Legacy Wrapper.
// But for now, exporting explicit classes is enough.
