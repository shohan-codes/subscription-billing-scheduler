import type { AppLogger } from '../../../common/app-logger';
import type { ShutdownState } from '../../../common/shutdown-state';
import type { CursorCodec } from '../../../common/utils/cursor-codec';
import type { AppConfigService } from '../../../config/app-config.service';
import type { InvoicesService } from '../../invoices/invoices.service';
import { $billingScheduler } from '../billing-scheduler.constant';
import type { BillingSchedulerHeartbeat } from '../billing-scheduler.heartbeat';
import type { BillingSchedulerRepository } from '../billing-scheduler.repository';
import { BillingSchedulerAction } from '../billing-scheduler.action';
import { BillingSchedulerService } from '../billing-scheduler.service';
import type {
    SchedulerLeaseRequest,
    SchedulerRunInsert,
    SchedulerRunRecord,
} from '../billing-scheduler.types';

const triggeredAt = new Date('2026-08-18T10:00:00.000Z');
const request: SchedulerLeaseRequest = {
    lockName: $billingScheduler.job.NAME,
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
        status: $billingScheduler.runStatus.COMPLETED,
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
                batchSize: 100,
                claimSeconds: 300,
                maxRunSeconds: 1800,
                maxItemsPerRun: 100_000,
                maxCatchUpPeriods: 12,
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
            createClaimOwner: jest.fn(() => 'instance-a:claim-owner'),
            createClaimExpiry: jest.fn(
                (now: Date) => new Date(now.getTime() + 300_000),
            ),
            createStaleRunThreshold: jest.fn(
                (now: Date) => new Date(now.getTime() - 120_000),
            ),
            resolveClaimBatchLimit: jest.fn(() => 100),
            isRunDurationLimitReached: jest.fn(() => false),
            validateTriggerAllowedOrThrow: jest.fn(),
            resolveCompletedStatus: jest.fn(
                () => $billingScheduler.runStatus.COMPLETED,
            ),
            classifyItemFailure: jest.fn(),
            resolveSafeRunFailure: jest.fn(() => ({
                code: $billingScheduler.errorCode.RUN_FAILED,
                message: 'Billing run failed unexpectedly',
            })),
            resolveInterruptedItemFailure: jest.fn(),
            resolveRetryAt: jest.fn(),
            validateManualRunOrThrow: jest.fn(),
        } as unknown as BillingSchedulerAction,
        {
            acquireLease,
            claimDueBatch: jest.fn().mockResolvedValue([]),
            abandonStaleRuns: jest.fn().mockResolvedValue([]),
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
        { generateClaimedCatchUp: jest.fn() } as unknown as InvoicesService,
        {} as CursorCodec,
        {
            info,
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as AppLogger,
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
                status: $billingScheduler.runStatus.SKIPPED_LOCK_UNAVAILABLE,
                trigger_type: $billingScheduler.triggerType.SCHEDULED,
                cutoff_date: '2026-08-18',
            }),
        );
        expect(releaseLease).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledWith(
            $billingScheduler.logEvent.RUN_SKIPPED,
            expect.objectContaining({
                result: $billingScheduler.runStatus.SKIPPED_LOCK_UNAVAILABLE,
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
            expect.objectContaining({
                status: $billingScheduler.runStatus.COMPLETED,
            }),
        );
        expect(stop).toHaveBeenCalled();
        expect(releaseLease).toHaveBeenCalledWith(
            request.lockName,
            request.ownerToken,
        );
    });
});
