export declare class GicsError extends Error {
    originalError?: any | undefined;
    constructor(message: string, originalError?: any | undefined);
}
export declare class IntegrityError extends GicsError {
    constructor(message: string);
}
export declare class IncompleteDataError extends GicsError {
    constructor(message: string);
}
export declare class LimitExceededError extends GicsError {
    constructor(message: string);
}
