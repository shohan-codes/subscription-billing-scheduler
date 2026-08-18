import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { RequestContext } from '../request-context';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    constructor(private readonly context: RequestContext) {}

    /** Resolves, propagates, and scopes the request correlation ID. */
    use(
        request: IncomingMessage,
        response: ServerResponse,
        next: () => void,
    ): void {
        const header = request.headers[REQUEST_ID_HEADER];
        const incoming = typeof header === 'string' ? header.trim() : undefined;
        const requestId =
            incoming && SAFE_REQUEST_ID.test(incoming)
                ? incoming
                : randomUUID();

        request.headers[REQUEST_ID_HEADER] = requestId;
        response.setHeader(REQUEST_ID_HEADER, requestId);
        this.context.run(requestId, next);
    }
}
