import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppLogger } from './app-logger';
import { Clock } from './clock';
import { CursorCodec } from './cursor-codec';
import { ApiExceptionFilter } from './filters/api-exception.filter';
import { RequestLoggingInterceptor } from './interceptors/request-logging.interceptor';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor';
import { RequestContext } from './request-context';
import { ShutdownState } from './shutdown-state';

@Module({
    providers: [
        AppLogger,
        Clock,
        CursorCodec,
        RequestContext,
        ShutdownState,
        { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
    ],
    exports: [AppLogger, Clock, CursorCodec, RequestContext, ShutdownState],
})
export class CommonModule {}
