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
