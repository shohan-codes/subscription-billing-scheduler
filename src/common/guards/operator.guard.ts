import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { AppLogger } from '../app-logger';
import { RequestContext } from '../request-context';

const BEARER_PREFIX = 'Bearer ';

/** Authorizes operator/admin requests and records the requesting actor. */
@Injectable()
export class OperatorGuard implements CanActivate {
    constructor(
        private readonly config: AppConfigService,
        private readonly context: RequestContext,
        private readonly logger: AppLogger,
    ) {}

    /** Authorizes a request with the configured operator bearer token. */
    canActivate(executionContext: ExecutionContext): boolean {
        const request = executionContext
            .switchToHttp()
            .getRequest<IncomingMessage>();
        const token = bearerToken(request.headers.authorization);
        const actorId = this.config.operator.id;
        const expectedToken = this.config.operator.token;

        if (
            !actorId ||
            !token ||
            !expectedToken ||
            !secureEqual(token, expectedToken)
        ) {
            throw new UnauthorizedException({
                code: 'OPERATOR_AUTH_REQUIRED',
                message: 'Operator authorization is required',
            });
        }

        this.context.setActorId(actorId);
        this.logger.info('operator_authorized');
        return true;
    }
}

/** Extracts a bearer token from an Authorization header. */
function bearerToken(authorization: string | undefined): string | undefined {
    if (!authorization?.startsWith(BEARER_PREFIX)) return undefined;
    const token = authorization.slice(BEARER_PREFIX.length).trim();
    return token || undefined;
}

/** Compares secrets using equal-length digests and constant-time comparison. */
function secureEqual(actual: string, expected: string): boolean {
    const actualDigest = createHash('sha256').update(actual).digest();
    const expectedDigest = createHash('sha256').update(expected).digest();

    return timingSafeEqual(actualDigest, expectedDigest);
}
