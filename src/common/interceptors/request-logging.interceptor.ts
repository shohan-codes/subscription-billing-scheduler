import { performance } from 'node:perf_hooks';
import {
    type CallHandler,
    type ExecutionContext,
    HttpException,
    Injectable,
    type NestInterceptor,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLogger } from '../app-logger';
import { $common } from '../common.constant';
import { resolveApiError } from '../errors/api-error';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
    constructor(
        private readonly adapterHost: HttpAdapterHost,
        private readonly logger: AppLogger,
    ) {}

    /** Logs one bounded structured outcome for each HTTP request. */
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        if (context.getType() !== 'http') return next.handle();

        const startedAt = performance.now();
        const http = context.switchToHttp();
        const request = http.getRequest<unknown>();
        const response = http.getResponse<{ statusCode: number }>();

        return next.handle().pipe(
            tap({
                next: () =>
                    this.logger.info($common.http.logEvent.REQUEST_COMPLETED, {
                        ...this.fields(request, response.statusCode, startedAt),
                        result: $common.http.result.SUCCESS,
                    }),
                error: (error: unknown) => {
                    const apiError = resolveApiError(error);

                    this.logger.error($common.http.logEvent.REQUEST_FAILED, {
                        ...this.fields(
                            request,
                            error instanceof HttpException
                                ? error.getStatus()
                                : 500,
                            startedAt,
                        ),
                        result: $common.http.result.FAILED,
                        errorCode: apiError.code,
                    });
                },
            }),
        );
    }

    /** Builds bounded HTTP request fields for structured logging. */
    private fields(request: unknown, statusCode: number, startedAt: number) {
        const adapter = this.adapterHost.httpAdapter;
        const url = adapter.getRequestUrl(request) as string;

        return {
            method: adapter.getRequestMethod(request) as string,
            path: url.split('?', 1)[0],
            statusCode,
            durationMs: Math.round(performance.now() - startedAt),
        };
    }
}
