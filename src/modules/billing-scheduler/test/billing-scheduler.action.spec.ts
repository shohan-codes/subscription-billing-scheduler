import { BillingSchedulerAction } from '../billing-scheduler.action';
import {
    BILLING_SCHEDULER_JOB_NAME,
    SchedulerRunStatus,
} from '../billing-scheduler.constant';
import {
    SchedulerLeaseUnavailableException,
    SchedulerShuttingDownException,
} from '../billing-scheduler.errors';
import type { SchedulerRunRecord } from '../billing-scheduler.types';

describe('BillingSchedulerAction', () => {
    const action = new BillingSchedulerAction();

    it('creates a fresh owner token and bounded lease expiry for each attempt', () => {
        const now = new Date('2026-08-18T10:00:00.000Z');
        const first = action.createLeaseRequest(now, 'instance-a', 120);
        const second = action.createLeaseRequest(now, 'instance-a', 120);

        expect(first.lockName).toBe(BILLING_SCHEDULER_JOB_NAME);
        expect(first.ownerToken).not.toBe(second.ownerToken);
        expect(first.ownerToken).toMatch(/^instance-a:/);
        expect(first.leaseExpiresAt.toISOString()).toBe(
            '2026-08-18T10:02:00.000Z',
        );
    });

    it('creates bounded subscription claim ownership and expiry', () => {
        const now = new Date('2026-08-18T10:00:00.000Z');
        const owner = action.createClaimOwner('instance-a');

        expect(owner).toMatch(/^instance-a:/);
        expect(owner.length).toBeLessThanOrEqual(120);
        expect(action.createClaimExpiry(now, 300).toISOString()).toBe(
            '2026-08-18T10:05:00.000Z',
        );
    });

    it('derives abandoned-run staleness from the coordinator lease window', () => {
        expect(
            action
                .createStaleRunThreshold(
                    new Date('2026-08-18T10:02:00.000Z'),
                    120,
                )
                .toISOString(),
        ).toBe('2026-08-18T10:00:00.000Z');
    });

    it('rejects new triggers after scheduler shutdown begins', () => {
        expect(() => action.validateTriggerAllowedOrThrow(true)).toThrow(
            SchedulerShuttingDownException,
        );
    });

    it('rejects a manual run that was skipped because the lease was unavailable', () => {
        expect(() =>
            action.validateManualRunOrThrow({
                status: SchedulerRunStatus.SkippedLockUnavailable,
            } as SchedulerRunRecord),
        ).toThrow(SchedulerLeaseUnavailableException);
    });

    it('applies the capped transient retry schedule without persisting raw errors', () => {
        const now = new Date('2026-08-18T10:00:00.000Z');
        const transient = action.classifyItemFailure(
            { code: '40P01', message: 'secret SQL payload' },
            0,
            now,
        );
        const capped = action.classifyItemFailure({ code: '40001' }, 5, now);

        expect(transient).toEqual({
            type: 'transient',
            code: 'DATABASE_TRANSIENT_FAILURE',
            message:
                'A temporary database error interrupted subscription billing',
            failureCount: 1,
            retryAt: new Date('2026-08-18T10:01:00.000Z'),
        });
        expect(capped.retryAt).toEqual(new Date('2026-08-18T16:00:00.000Z'));
        expect(transient.message).not.toContain('secret');
    });

    it('classifies unknown item failures as permanent safe failures', () => {
        expect(
            action.classifyItemFailure(
                new Error('stack and sensitive payload'),
                2,
                new Date('2026-08-18T10:00:00.000Z'),
            ),
        ).toEqual({
            type: 'permanent',
            code: 'BILLING_ITEM_FAILED',
            message:
                'Subscription billing failed because of an unrecoverable item error',
            failureCount: 2,
            retryAt: null,
        });
    });

    it('marks completed runs with item failures as completed with errors', () => {
        expect(
            action.resolveCompletedStatus({
                eligibleCount: 2,
                claimedCount: 2,
                succeededCount: 1,
                failedCount: 1,
                skippedCount: 0,
                invoicesCreatedCount: 1,
            }),
        ).toBe(SchedulerRunStatus.CompletedWithErrors);
    });
});
