export interface Metrics {
    time_ms: number;
    ram_peak_mb: number;
    time_setup_ms?: number;
    time_encode_ms?: number;
}
export declare function measure<T>(fn: () => Promise<T> | T): Promise<{
    result: T;
    metrics: Metrics;
}>;
export declare function measureSplit<T>(setupFn: () => Promise<any> | any, actionFn: (context: any) => Promise<T> | T): Promise<{
    result: T;
    metrics: Metrics;
}>;
export declare function stats(values: number[]): {
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
};
