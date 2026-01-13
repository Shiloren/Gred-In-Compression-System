export const GICS_MAGIC_V2 = new Uint8Array([0x47, 0x49, 0x43, 0x53]); // "GICS"
export const GICS_VERSION_BYTE = 0x02;
export var StreamId;
(function (StreamId) {
    StreamId[StreamId["TIME"] = 10] = "TIME";
    StreamId[StreamId["VALUE"] = 20] = "VALUE";
    StreamId[StreamId["META"] = 30] = "META";
    StreamId[StreamId["ITEM_ID"] = 40] = "ITEM_ID";
    StreamId[StreamId["QUANTITY"] = 50] = "QUANTITY";
    StreamId[StreamId["SNAPSHOT_LEN"] = 60] = "SNAPSHOT_LEN";
})(StreamId || (StreamId = {}));
export var CodecId;
(function (CodecId) {
    CodecId[CodecId["NONE"] = 0] = "NONE";
    CodecId[CodecId["VARINT_DELTA"] = 1] = "VARINT_DELTA";
    CodecId[CodecId["BITPACK_DELTA"] = 2] = "BITPACK_DELTA";
    CodecId[CodecId["RLE_ZIGZAG"] = 3] = "RLE_ZIGZAG";
    CodecId[CodecId["RLE_DOD"] = 4] = "RLE_DOD";
    CodecId[CodecId["DOD_VARINT"] = 5] = "DOD_VARINT";
    CodecId[CodecId["DICT_VARINT"] = 6] = "DICT_VARINT";
})(CodecId || (CodecId = {}));
export var HealthTag;
(function (HealthTag) {
    HealthTag[HealthTag["OK"] = 0] = "OK";
    HealthTag[HealthTag["WARN"] = 1] = "WARN";
    HealthTag[HealthTag["QUAR"] = 2] = "QUAR";
})(HealthTag || (HealthTag = {}));
// Block Header layout:
// [stream_id (u8)] [codec_id (u8)] [n_items (u32)] [payload_len (u32)] [flags_low (u8)]
// V1.1 had 10 bytes. We added flags byte? 
// The initial V1.2 implementation reused the 10 byte header.
// To add Flags into Block Header without breaking too much:
// stream_id (u8) is fine.
// codec_id (u8) is fine.
// n_items (u32) is fine.
// payload_len (u32) is fine.
// We need a place for flags. 
// OPTION A: Add 1 byte. Header becomes 11 bytes.
// OPTION B: Steal from codec_id? No, 255 codecs needed eventually.
// OPTION C: Steal from stream_id? No.
// Let's make Block Header 11 bytes in V1.2.
export const BLOCK_HEADER_SIZE = 1 + 1 + 4 + 4 + 1;
export const V12_FLAGS = {
    FIELDWISE_TS: 1 << 0,
    CONTEXT_ENABLED: 1 << 1,
    REGIME_SWITCH: 1 << 2, // Legacy hint
};
export const BLOCK_FLAGS = {
    NONE: 0,
    ANOMALY_START: 1 << 0,
    ANOMALY_MID: 1 << 1,
    ANOMALY_END: 1 << 2,
    // Bits 3-4 for HealthTag
    HEALTH_WARN: 1 << 3,
    HEALTH_QUAR: 1 << 4,
};
export var RecoveryAction;
(function (RecoveryAction) {
    RecoveryAction["INSPECT"] = "INSPECT";
    RecoveryAction["RETRY"] = "RETRY";
    RecoveryAction["IGNORE"] = "IGNORE";
})(RecoveryAction || (RecoveryAction = {}));
export const GICS_EOS_MARKER = 0xFF;
