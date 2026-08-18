import type { AppLogger } from '../../../common/app-logger';
import type { Clock } from '../../../common/clock';
import type { AppConfigService } from '../../../config/app-config.service';
import { BillingSchedulerHeartbeat } from '../billing-scheduler.heartbeat';
import type { BillingSchedulerRepository } from '../billing-scheduler.repository';

const context = {
    lockName: 'billing.invoice.scheduler',
    ownerToken: 'instance-a:owner-a',
    runId: '8ad3be99-71fc-463f-bf74-76b0bd09643f',
};

/** Builds heartbeat dependencies around a configurable lease-renewal result. */
function createHeartbeat(renewed: boolean) {
    const renewLease = jest
        .fn()
        .mockResolvedValue(
            renewed ? { lock_name: context.lockName } : undefined,
        );
    const updateRunHeartbeat = jest.fn().mockResolvedValue(true);
    const warn = jest.fn();
    const heartbeat = new BillingSchedulerHeartbeat(
        {
            billing: { heartbeatSeconds: 30, leaseSeconds: 120 },
        } as unknown as AppConfigService,
        {
            now: jest.fn(() => new Date('2026-08-18T10:00:30.000Z')),
        } as unknown as Clock,
        {
            renewLease,
            updateRunHeartbeat,
        } as unknown as BillingSchedulerRepository,
        { debug: jest.fn(), warn } as unknown as AppLogger,
    );

    return { heartbeat, renewLease, updateRunHeartbeat, warn };
}

describe('BillingSchedulerHeartbeat', () => {
    it('renews the active owner lease and updates run liveness', async () => {
        const { heartbeat, renewLease, updateRunHeartbeat } =
            createHeartbeat(true);

        await expect(heartbeat.renewNow(context)).resolves.toBe(true);
        expect(renewLease).toHaveBeenCalledWith(
            context.lockName,
            context.ownerToken,
            new Date('2026-08-18T10:00:30.000Z'),
            new Date('2026-08-18T10:02:30.000Z'),
        );
        expect(updateRunHeartbeat).toHaveBeenCalledWith(
            context.runId,
            context.ownerToken,
            new Date('2026-08-18T10:00:30.000Z'),
        );
        expect(heartbeat.isLeaseLost).toBe(false);
    });

    it('marks ownership lost when heartbeat persistence fails', async () => {
        const { heartbeat, renewLease, warn } = createHeartbeat(true);
        renewLease.mockRejectedValueOnce(new Error('database unavailable'));

        await expect(heartbeat.renewNow(context)).resolves.toBe(false);
        expect(heartbeat.isLeaseLost).toBe(true);
        expect(warn).toHaveBeenCalledWith('billing.lease.heartbeat_failed', {
            jobName: context.lockName,
            runId: context.runId,
            errorCode: 'SCHEDULER_LEASE_LOST',
        });
    });

    it('marks ownership lost and stops continuation after renewal failure', async () => {
        const { heartbeat, updateRunHeartbeat, warn } = createHeartbeat(false);

        await expect(heartbeat.renewNow(context)).resolves.toBe(false);
        expect(updateRunHeartbeat).not.toHaveBeenCalled();
        expect(heartbeat.isLeaseLost).toBe(true);
        expect(warn).toHaveBeenCalledWith('billing.lease.lost', {
            jobName: context.lockName,
            runId: context.runId,
            errorCode: 'SCHEDULER_LEASE_LOST',
        });
    });
});
