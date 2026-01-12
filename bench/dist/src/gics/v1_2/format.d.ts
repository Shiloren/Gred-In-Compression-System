export declare const GICS_MAGIC_V2: Uint8Array<ArrayBuffer>;
export declare const GICS_VERSION_BYTE = 2;
export declare enum StreamId {
    TIME = 10,// Arbitrary IDs to avoid confusion with 0
    VALUE = 20,
    META = 30
}
export declare enum CodecId {
    NONE = 0,
    VARINT_DELTA = 1,
    BITPACK_DELTA = 2,
    RLE_ZIGZAG = 3,
    RLE_DOD = 4,// For Time mainly
    DOD_VARINT = 5,// For Time mainly (Delta-of-Delta + Varint)
    DICT_VARINT = 6
}
export declare enum HealthTag {
    OK = 0,
    WARN = 1,
    QUAR = 2
}
export interface HeaderV2 {
    magic: Uint8Array;
    version: number;
    flags: number;
    contextId?: string;
}
export declare const BLOCK_HEADER_SIZE: number;
export declare const V12_FLAGS: {
    FIELDWISE_TS: number;
    CONTEXT_ENABLED: number;
    REGIME_SWITCH: number;
};
export declare const BLOCK_FLAGS: {
    NONE: number;
    ANOMALY_START: number;
    ANOMALY_MID: number;
    ANOMALY_END: number;
    HEALTH_WARN: number;
    HEALTH_QUAR: number;
};
export declare enum RecoveryAction {
    INSPECT = "INSPECT",
    RETRY = "RETRY",
    IGNORE = "IGNORE"
}
