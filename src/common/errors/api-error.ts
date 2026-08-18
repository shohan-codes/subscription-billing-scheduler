import { HttpException, HttpStatus } from '@nestjs/common';

export type ApiError = {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
};

/** Maps thrown values to the safe public error contract. */
export function resolveApiError(exception: unknown): ApiError {
    if (!(exception instanceof HttpException)) {
        return {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error',
        };
    }

    const statusCode = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
        return {
            statusCode,
            code: statusCodeToCode(statusCode),
            message: response,
        };
    }

    if (!isRecord(response)) {
        return {
            statusCode,
            code: statusCodeToCode(statusCode),
            message: exception.message,
        };
    }

    const rawMessage = response.message;
    const details =
        response.details ??
        (Array.isArray(rawMessage) ? { errors: rawMessage } : undefined);

    return {
        statusCode,
        code:
            typeof response.code === 'string'
                ? response.code
                : statusCodeToCode(statusCode),
        message: Array.isArray(rawMessage)
            ? 'Validation failed'
            : typeof rawMessage === 'string'
              ? rawMessage
              : exception.message,
        ...(details === undefined ? {} : { details }),
    };
}

const HTTP_ERROR_CODES: Partial<Record<number, string>> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
    [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
    [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Maps an HTTP status to a stable fallback error code. */
function statusCodeToCode(statusCode: number): string {
    return HTTP_ERROR_CODES[statusCode] ?? `HTTP_${statusCode}`;
}

/** Checks whether a value is a non-null record. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
