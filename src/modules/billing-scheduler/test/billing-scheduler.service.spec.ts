import type { AppLogger } from '../../../common/app-logger';
import type { ShutdownState } from '../../../common/shutdown-state';
import type { CursorCodec } from '../../../common/utils/cursor-codec';
import type { AppConfigService } from '../../../config/app-config.service';
import { SchedulerRunStatus } from '../billing-scheduler.constant';
import type { BillingSchedulerHeartbeat } from '../billing-scheduler.heartbeat';
import type { BillingSchedulerRepository } from '../billing-scheduler.repository';
import { BillingSchedulerService } from '../billing-scheduler.service';
import type {
    SchedulerLeaseRequest,
    SchedulerRunInsert,
    SchedulerRunRecord,
} from '../billing-scheduler.types';

const triggeredAt = new Date('2026-08-18T10:00:00.000Z');
const request: SchedulerLeaseRequest = {
    lockName: 'billing.invoice.scheduler',
    ownerToken: 'instance-a:owner-a',
    acquiredAt: triggeredAt,
    leaseExpiresAt: new Date('2026-08-18T10:02:00.000Z'),
};

/** Builds the scheduler service with focused mocks for coordinator tests. */
function createService(acquired: boolean, shuttingDown = false) {
    const acquireLease = jest.fn().mockResolvedValue(
        acquired
            ? {
                  lock_name: request.lockName,
                  owner_token: request.ownerToken,
              }
            : undefined,
    );
    const createRunOrThrow = jest
        .fn()
        .mockImplementation((insert: SchedulerRunInsert) =>
            Promise.resolve({
                ...insert,
                id: insert.id,
                created_at: triggeredAt,
                updated_at: triggeredAt,
            } as SchedulerRunRecord),
        );
    const finalizeRunOrThrow = jest.fn().mockResolvedValue({
        id: 'run-a',
        status: SchedulerRunStatus.Completed,
    });
    const releaseLease = jest.fn().mockResolvedValue(true);
    const start = jest.fn();
    const stop = jest.fn();
    const beginShutdown = jest.fn();
    const info = jest.fn();
    const service = new BillingSchedulerService(
        {
            app: { instanceId: 'instance-a' },
            billing: {
                leaseSeconds: 120,
                timezone: 'UTC',
            },
        } as unknown as AppConfigService,
        {
            now: jest.fn(() => triggeredAt),
            dateInTimeZone: jest.fn(() => '2026-08-18'),
        },
        {
            isShuttingDown: shuttingDown,
            beginShutdown,
            beforeApplicationShutdown: jest.fn(),
        } as unknown as ShutdownState,
        {
            createLeaseRequest: jest.fn(() => request),
            validateTriggerAllowedOrThrow: jest.fn(),
            resolveCompletedStatus: jest.fn(() => SchedulerRunStatus.Completed),
            resolveSafeRunFailure: jest.fn(() => ({
                code: 'SCHEDULER_RUN_FAILED',
                message: 'Billing run failed unexpectedly',
            })),
            validateManualRunOrThrow: jest.fn(),
        },
        {
            acquireLease,
            createRunOrThrow,
            finalizeRunOrThrow,
            finalizeRun: jest.fn(),
            releaseLease,
        } as unknown as BillingSchedulerRepository,
        {
            start,
            stop,
            isLeaseLost: false,
        } as unknown as BillingSchedulerHeartbeat,
        {} as CursorCodec,
        { info, error: jest.fn() } as unknown as AppLogger,
    );

    return {
        service,
        acquireLease,
        createRunOrThrow,
        finalizeRunOrThrow,
        releaseLease,
        start,
        stop,
        beginShutdown,
        info,
    };
}

describe('BillingSchedulerService', () => {
    it('does not start scheduled work after shutdown begins', async () => {
        const { service, acquireLease } = createService(true, true);

        await service.triggerScheduled();

        expect(acquireLease).not.toHaveBeenCalled();
    });

    it('marks shutdown and completes lifecycle waiting when no work is active', async () => {
        const { service, beginShutdown } = createService(true);

        await service.beforeApplicationShutdown();

        expect(beginShutdown).toHaveBeenCalledTimes(1);
    });

    it('persists lock contention without releasing an unowned lease', async () => {
        const { service, createRunOrThrow, releaseLease, info } =
            createService(false);

        await service.triggerScheduled();

        expect(createRunOrThrow).toHaveBeenCalledWith(
            expect.objectContaining({
                status: SchedulerRunStatus.SkippedLockUnavailable,
                trigger_type: 'scheduled',
                cutoff_date: '2026-08-18',
            }),
        );
        expect(releaseLease).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledWith(
            'billing.run.skipped',
            expect.objectContaining({
                result: SchedulerRunStatus.SkippedLockUnavailable,
            }),
        );
    });

    it('finalizes and releases only the exact acquired owner lease', async () => {
        const {
            service,
            acquireLease,
            finalizeRunOrThrow,
            releaseLease,
            start,
            stop,
        } = createService(true);

        await service.triggerScheduled();

        expect(acquireLease).toHaveBeenCalledWith(request);
        expect(start).toHaveBeenCalledWith(
            expect.objectContaining({
                lockName: request.lockName,
                ownerToken: request.ownerToken,
            }),
        );
        expect(finalizeRunOrThrow).toHaveBeenCalledWith(
            expect.any(String),
            request.ownerToken,
            expect.objectContaining({ status: SchedulerRunStatus.Completed }),
        );
        expect(stop).toHaveBeenCalled();
        expect(releaseLease).toHaveBeenCalledWith(
            request.lockName,
            request.ownerToken,
        );
    });
});
