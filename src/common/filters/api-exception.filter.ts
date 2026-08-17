import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Clock } from '../clock';
import { resolveApiError } from '../errors/api-error';
import { RequestContext } from '../request-context';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
    constructor(
        private readonly adapterHost: HttpAdapterHost,
        private readonly clock: Clock,
        private readonly context: RequestContext,
    ) {}

    /** Converts HTTP failures to the safe API error envelope. */
    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<unknown>();
        const error = resolveApiError(exception);
        const body = {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
            requestId: this.context.requestId ?? 'unknown',
            timestamp: this.clock.now().toISOString(),
        };

        this.adapterHost.httpAdapter.reply(response, body, error.statusCode);
    }
}
