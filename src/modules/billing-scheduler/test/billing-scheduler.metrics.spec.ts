import { $subscription } from '../../subscriptions/subscriptions.constant';
import { $billingScheduler } from '../billing-scheduler.constant';
import { BillingSchedulerMetrics } from '../billing-scheduler.metrics';
import type { SchedulerRunRecord } from '../billing-scheduler.types';

describe('BillingSchedulerMetrics', () => {
    it('renders required metrics with bounded labels only', () => {
        const metrics = new BillingSchedulerMetrics();
        metrics.recordRun(
            {
                id: 'run-1',
                trigger_type: $billingScheduler.triggerType.MANUAL,
                status: $billingScheduler.runStatus.COMPLETED,
                triggered_at: new Date('2026-08-19T00:00:00.000Z'),
                started_at: new Date('2026-08-19T00:00:00.000Z'),
                completed_at: new Date('2026-08-19T00:00:01.000Z'),
            } as SchedulerRunRecord,
            1000,
        );
        metrics.recordItem(
            $billingScheduler.runItemResult.SUCCESS,
            $billingScheduler.metricLabel.NONE,
            250,
        );
        metrics.recordInvoices(['USD']);
        metrics.recordDueCounts([
            {
                billingState: $subscription.billingState.READY,
                count: 3,
            },
        ]);
        metrics.recordExpiredClaims(2);
        metrics.recordLeaseContention($billingScheduler.job.NAME);
        metrics.recordScheduleLag('2026-08-19', '2026-08-17');

        const output = metrics.render();

        expect(output).toContain('billing_run_total');
        expect(output).toContain('trigger_type="manual"');
        expect(output).toContain('status="completed"');
        expect(output).toContain('billing_subscription_processed_total');
        expect(output).toContain('error_code="none"');
        expect(output).toContain(
            'billing_invoice_created_total{currency="USD"} 1',
        );
        expect(output).toContain('billing_due_subscription_count');
        expect(output).toContain('billing_claim_expired_total 2');
        expect(output).toContain('billing_lease_contention_total');
        expect(output).toContain('billing_schedule_lag_days');
        expect(output).not.toContain('run-1');
        expect(output).not.toContain('subscriptionId');
    });
});
