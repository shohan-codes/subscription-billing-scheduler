import type { AppLogger } from '../../../common/app-logger';
import type { Clock } from '../../../common/clock';
import type { AppConfigService } from '../../../config/app-config.service';
import { BillingSchedulerService } from '../billing-scheduler.service';
import type { BillingSchedulerRepository } from '../billing-scheduler.repository';
import type { SchedulerLeaseRequest } from '../billing-scheduler.types';

const request: SchedulerLeaseRequest = {
    lockName: 'billing.invoice.scheduler',
    ownerToken: 'instance-a:owner-a',
    acquiredAt: new Date('2026-08-18T10:00:00.000Z'),
    leaseExpiresAt: new Date('2026-08-18T10:02:00.000Z'),
};

/** Builds the scheduler service with focused mocks for coordinator tests. */
function createService(acquired: boolean) {
    const acquireLease = jest.fn().mockResolvedValue(
        acquired
            ? {
                  lock_name: request.lockName,
                  owner_token: request.ownerToken,
              }
            : undefined,
    );
    const releaseLease = jest.fn().mockResolvedValue(true);
    const info = jest.fn();
    const service = new BillingSchedulerService(
        {
            app: { instanceId: 'instance-a' },
            billing: { leaseSeconds: 120 },
        } as unknown as AppConfigService,
        { now: jest.fn(() => request.acquiredAt) } as unknown as Clock,
        {
            createLeaseRequest: jest.fn(() => request),
        },
        {
            acquireLease,
            releaseLease,
        } as unknown as BillingSchedulerRepository,
        { info } as unknown as AppLogger,
    );

    return { service, acquireLease, releaseLease, info };
}

describe('BillingSchedulerService', () => {
    it('records lock contention without releasing an unowned lease', async () => {
        const { service, releaseLease, info } = createService(false);

        await service.triggerScheduled();

        expect(releaseLease).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledWith('billing.run.skipped', {
            jobName: request.lockName,
            result: 'skipped_lock_unavailable',
        });
    });

    it('releases only the exact lease returned by acquisition', async () => {
        const { service, acquireLease, releaseLease } = createService(true);

        await service.triggerScheduled();

        expect(acquireLease).toHaveBeenCalledWith(request);
        expect(releaseLease).toHaveBeenCalledWith(
            request.lockName,
            request.ownerToken,
        );
    });
});
