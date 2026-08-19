import type { AppLogger } from '../../../common/app-logger';
import type { Clock } from '../../../common/clock';
import type { AppConfigService } from '../../../config/app-config.service';
import { $billingScheduler } from '../billing-scheduler.constant';
import { BillingSchedulerHeartbeat } from '../billing-scheduler.heartbeat';
import type { BillingSchedulerRepository } from '../billing-scheduler.repository';

const context = {
    lockName: $billingScheduler.job.NAME,
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
            billing: { HEARTBEAT_SECONDS: 30, LEASE_SECONDS: 120 },
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
        expect(warn).toHaveBeenCalledWith(
            $billingScheduler.logEvent.LEASE_HEARTBEAT_FAILED,
            {
                jobName: context.lockName,
                runId: context.runId,
                errorCode: $billingScheduler.errorCode.LEASE_LOST,
            },
        );
    });

    it('marks ownership lost and stops continuation after renewal failure', async () => {
        const { heartbeat, updateRunHeartbeat, warn } = createHeartbeat(false);

        await expect(heartbeat.renewNow(context)).resolves.toBe(false);
        expect(updateRunHeartbeat).not.toHaveBeenCalled();
        expect(heartbeat.isLeaseLost).toBe(true);
        expect(warn).toHaveBeenCalledWith(
            $billingScheduler.logEvent.LEASE_LOST,
            {
                jobName: context.lockName,
                runId: context.runId,
                errorCode: $billingScheduler.errorCode.LEASE_LOST,
            },
        );
    });
});
