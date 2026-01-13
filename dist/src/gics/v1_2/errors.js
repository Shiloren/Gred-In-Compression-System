export class GicsError extends Error {
    originalError;
    constructor(message, originalError) {
        super(message);
        this.originalError = originalError;
        this.name = 'GicsError';
    }
}
export class IntegrityError extends GicsError {
    constructor(message) {
        super(message);
        this.name = 'IntegrityError';
    }
}
export class IncompleteDataError extends GicsError {
    constructor(message) {
        super(message);
        this.name = 'IncompleteDataError';
    }
}
export class LimitExceededError extends GicsError {
    constructor(message) {
        super(message);
        this.name = 'LimitExceededError';
    }
}
