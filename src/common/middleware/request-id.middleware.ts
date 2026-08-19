import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { $common } from '../common.constant';
import { RequestContext } from '../request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    constructor(private readonly context: RequestContext) {}

    /** Resolves, propagates, and scopes the request correlation ID. */
    use(
        request: IncomingMessage,
        response: ServerResponse,
        next: () => void,
    ): void {
        const header = request.headers[$common.http.header.REQUEST_ID];
        const incoming = typeof header === 'string' ? header.trim() : undefined;
        const requestId =
            incoming && $common.requestId.SAFE_PATTERN.test(incoming)
                ? incoming
                : randomUUID();

        request.headers[$common.http.header.REQUEST_ID] = requestId;
        response.setHeader($common.http.header.REQUEST_ID, requestId);
        this.context.run(requestId, next);
    }
}
