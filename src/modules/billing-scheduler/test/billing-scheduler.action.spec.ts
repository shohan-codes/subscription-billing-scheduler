import { BillingSchedulerAction } from '../billing-scheduler.action';
import { BILLING_SCHEDULER_JOB_NAME } from '../billing-scheduler.constant';

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
});
