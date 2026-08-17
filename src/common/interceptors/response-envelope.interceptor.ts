import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_ENVELOPE } from '../decorators/skip-envelope.decorator';

export type ResponseEnvelope<T> = {
    success: true;
    data: T;
    message: '';
    errors: [];
};

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    /** Wraps HTTP success responses unless the route explicitly opts out. */
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        if (
            context.getType() !== 'http' ||
            this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE, [
                context.getHandler(),
                context.getClass(),
            ])
        ) {
            return next.handle();
        }

        return next.handle().pipe(
            map((data): ResponseEnvelope<unknown> => ({
                success: true,
                data: data ?? null,
                message: '',
                errors: [],
            })),
        );
    }
}
