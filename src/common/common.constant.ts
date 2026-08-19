export const $common = {
    errorCode: {
        BAD_REQUEST: 'BAD_REQUEST',
        UNAUTHORIZED: 'UNAUTHORIZED',
        FORBIDDEN: 'FORBIDDEN',
        NOT_FOUND: 'NOT_FOUND',
        CONFLICT: 'CONFLICT',
        UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
        TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
        INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
        SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    },
    cursor: {
        MAX_LENGTH: 512,
        page: {
            DEFAULT_LIMIT: 50,
            MAX_LIMIT: 100,
        },
        BASE64_URL_PATTERN: /^[A-Za-z0-9_-]+$/,
        ENCODING: 'base64url',
        errorCode: {
            INVALID: 'INVALID_CURSOR',
        },
    },
    http: {
        header: {
            REQUEST_ID: 'x-request-id',
        },
        logEvent: {
            REQUEST_COMPLETED: 'http.request.completed',
            REQUEST_FAILED: 'http.request.failed',
        },
        result: {
            SUCCESS: 'success',
            FAILED: 'failed',
        },
    },
    log: {
        level: {
            DEBUG: 'debug',
            INFO: 'info',
            WARN: 'warn',
            ERROR: 'error',
        },
    },
    operator: {
        auth: {
            BEARER_PREFIX: 'Bearer ',
            ERROR_CODE: 'OPERATOR_AUTH_REQUIRED',
            LOG_EVENT: 'operator_authorized',
        },
    },
    requestId: {
        SAFE_PATTERN: /^[A-Za-z0-9._:-]{1,128}$/,
    },
} as const;

export type CommonLogLevel =
    (typeof $common.log.level)[keyof typeof $common.log.level];
