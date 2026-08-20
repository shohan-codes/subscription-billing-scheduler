import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import { AppLogger } from '../app-logger';
import type { Clock } from '../clock';
import type { RequestContext } from '../request-context';

describe('AppLogger', () => {
    it('adds correlation fields and redacts sensitive values', () => {
        const output = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        const logger = new AppLogger(
            { app: { INSTANCE_ID: 'instance-1' } } as AppConfigService,
            {
                now: () => new Date('2026-08-17T04:00:00.000Z'),
            } as Clock,
            { requestId: 'request-1', actorId: 'operator-1' } as RequestContext,
        );

        logger.info('billing.run.started', {
            runId: 'run-1',
            ownerToken: 'do-not-log',
            databaseUrl: 'postgresql://secret@localhost/db',
            authorization: 'Bearer secret',
        });

        expect(output).toHaveBeenCalledWith({
            runId: 'run-1',
            ownerToken: '[REDACTED]',
            databaseUrl: '[REDACTED]',
            authorization: '[REDACTED]',
            timestamp: '2026-08-17T04:00:00.000Z',
            level: 'info',
            event: 'billing.run.started',
            requestId: 'request-1',
            actorId: 'operator-1',
            instanceId: 'instance-1',
        });
        output.mockRestore();
    });
});
