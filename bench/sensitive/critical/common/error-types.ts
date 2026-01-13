export class IntegrityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IntegrityError';
    }
}

export class IncompleteDataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IncompleteDataError';
    }
}

export class GicsError extends Error {
    constructor(message: string, public originalError?: any) {
        super(message);
        this.name = 'GicsError';
    }
}
export class CriticalError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CriticalError';
    }
}

export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}
