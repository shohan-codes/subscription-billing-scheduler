import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import type { AppLogger } from '../app-logger';
import { OperatorGuard } from '../guards/operator.guard';
import type { RequestContext } from '../request-context';

const TOKEN = '0123456789abcdef0123456789abcdef';

describe('OperatorGuard', () => {
    const setActorId = jest.fn();
    const logInfo = jest.fn();
    const context = { setActorId } as unknown as RequestContext;
    const logger = { info: logInfo } as unknown as AppLogger;
    const guard = new OperatorGuard(
        {
            operator: { ID: 'operator-1', TOKEN: TOKEN },
        } as unknown as AppConfigService,
        context,
        logger,
    );

    beforeEach(() => jest.clearAllMocks());

    it('binds the configured actor to an authorized bearer token', () => {
        expect(guard.canActivate(httpContext(`Bearer ${TOKEN}`))).toBe(true);
        expect(setActorId).toHaveBeenCalledWith('operator-1');
        expect(logInfo).toHaveBeenCalledWith('operator_authorized');
    });

    it('rejects missing or unknown operator credentials', () => {
        expect(() => guard.canActivate(httpContext())).toThrow(
            UnauthorizedException,
        );
        expect(() =>
            guard.canActivate(httpContext('Bearer wrong-token')),
        ).toThrow(UnauthorizedException);
    });
});

/** Builds a minimal HTTP execution context for guard tests. */
function httpContext(authorization?: string): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ headers: { authorization } }),
        }),
    } as unknown as ExecutionContext;
}
