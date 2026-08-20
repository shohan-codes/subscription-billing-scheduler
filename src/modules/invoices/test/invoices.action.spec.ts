import { $subscription } from '../../subscriptions/subscriptions.constant';
import { SubscriptionsAction } from '../../subscriptions/subscriptions.action';
import type { SubscriptionRecord } from '../../subscriptions/subscriptions.types';
import { InvoicesAction } from '../invoices.action';
import {
    InvoicePeriodConflictException,
    SubscriptionClaimLostException,
    SubscriptionNotBillableException,
} from '../invoices.errors';
import type {
    GenerateClaimedInvoiceRequest,
    InvoiceRecord,
} from '../invoices.types';
import { $invoice } from '../invoices.constant';

/** Builds the claimed subscription baseline used by invoice action tests. */
const claimedSubscription = (): SubscriptionRecord => ({
    id: '81849854-7497-4ea4-a097-7aebf39f97f7',
    customer_reference: 'CUST-1001',
    description: 'Pro Plan - Monthly',
    status: $subscription.status.ACTIVE,
    billing_state: $subscription.billingState.READY,
    currency: 'USD',
    amount: '49.0000',
    start_date: '2026-01-01',
    next_billing_date: '2026-01-31',
    billing_anchor_day: 31,
    anchor_is_month_end: false,
    billing_failure_count: 0,
    billing_retry_at: null,
    last_billing_error_code: null,
    last_billing_error_message: null,
    processing_run_id: '7ca80aa5-c034-4858-898a-ea77536f64f0',
    processing_owner: 'instance-a:claim-1',
    processing_started_at: new Date('2026-01-31T00:05:00.000Z'),
    processing_expires_at: new Date('2026-01-31T00:10:00.000Z'),
    version: 1,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-31T00:05:00.000Z'),
});

/** Builds the run claim identity used by invoice action tests. */
const generationRequest = (): GenerateClaimedInvoiceRequest => ({
    subscriptionId: '81849854-7497-4ea4-a097-7aebf39f97f7',
    runId: '7ca80aa5-c034-4858-898a-ea77536f64f0',
    owner: 'instance-a:claim-1',
    cutoffDate: '2026-01-31',
});

/** Builds an existing invoice matching the baseline billing obligation. */
const existingInvoice = (): InvoiceRecord => ({
    id: '45ad94ec-c56d-4444-9713-51caf5e319a3',
    invoice_number: 'INV-20260131-EXISTING',
    subscription_id: '81849854-7497-4ea4-a097-7aebf39f97f7',
    customer_reference: 'CUST-1001',
    billing_period_start: '2026-01-31',
    billing_period_end: '2026-02-28',
    issue_date: '2026-01-31',
    status: $invoice.status.ISSUED,
    currency: 'USD',
    subtotal: '49.0000',
    tax_total: '0.0000',
    discount_total: '0.0000',
    total: '49.0000',
    idempotency_key:
        'invoice:81849854-7497-4ea4-a097-7aebf39f97f7:2026-01-31:2026-02-28',
    generated_by_run_id: '7ca80aa5-c034-4858-898a-ea77536f64f0',
    created_at: new Date('2026-01-31T00:05:00.000Z'),
});

describe('InvoicesAction', () => {
    const action = new InvoicesAction(new SubscriptionsAction());
    const now = new Date('2026-01-31T00:06:00.000Z');

    it('accepts a currently owned and eligible subscription claim', () => {
        expect(() =>
            action.validateClaimedSubscriptionOrThrow(
                claimedSubscription(),
                generationRequest(),
                now,
            ),
        ).not.toThrow();
    });

    it('rejects a missing, changed or expired processing claim', () => {
        expect(() =>
            action.validateClaimedSubscriptionOrThrow(
                { ...claimedSubscription(), processing_owner: 'other-owner' },
                generationRequest(),
                now,
            ),
        ).toThrow(SubscriptionClaimLostException);

        expect(() =>
            action.validateClaimedSubscriptionOrThrow(
                {
                    ...claimedSubscription(),
                    processing_expires_at: new Date('2026-01-31T00:06:00.000Z'),
                },
                generationRequest(),
                now,
            ),
        ).toThrow(SubscriptionClaimLostException);
    });

    it('rejects subscriptions that are not currently billable', () => {
        expect(() =>
            action.validateClaimedSubscriptionOrThrow(
                {
                    ...claimedSubscription(),
                    status: $subscription.status.PAUSED,
                },
                generationRequest(),
                now,
            ),
        ).toThrow(SubscriptionNotBillableException);

        expect(() =>
            action.validateClaimedSubscriptionOrThrow(
                {
                    ...claimedSubscription(),
                    billing_state: $subscription.billingState.BLOCKED,
                },
                generationRequest(),
                now,
            ),
        ).toThrow(SubscriptionNotBillableException);

        expect(() =>
            action.validateClaimedSubscriptionOrThrow(
                {
                    ...claimedSubscription(),
                    billing_state: $subscription.billingState.RETRY_WAIT,
                    billing_retry_at: new Date('2026-01-31T00:07:00.000Z'),
                },
                generationRequest(),
                now,
            ),
        ).toThrow(SubscriptionNotBillableException);

        expect(() =>
            action.validateClaimedSubscriptionOrThrow(
                {
                    ...claimedSubscription(),
                    next_billing_date: '2026-02-28',
                },
                generationRequest(),
                now,
            ),
        ).toThrow(SubscriptionNotBillableException);
    });

    it('builds baseline invoice totals, item snapshots and next billing date', () => {
        const draft = action.buildGenerationDraft(
            claimedSubscription(),
            generationRequest(),
        );

        expect(draft.invoice).toMatchObject({
            subscription_id: '81849854-7497-4ea4-a097-7aebf39f97f7',
            customer_reference: 'CUST-1001',
            billing_period_start: '2026-01-31',
            billing_period_end: '2026-02-28',
            issue_date: '2026-01-31',
            status: 'issued',
            currency: 'USD',
            subtotal: '49.0000',
            tax_total: '0.0000',
            discount_total: '0.0000',
            total: '49.0000',
            idempotency_key:
                'invoice:81849854-7497-4ea4-a097-7aebf39f97f7:2026-01-31:2026-02-28',
            generated_by_run_id: '7ca80aa5-c034-4858-898a-ea77536f64f0',
        });
        expect(draft.item).toMatchObject({
            description: 'Pro Plan - Monthly',
            quantity: '1.0000',
            unit_price: '49.0000',
            line_total: '49.0000',
        });
        expect(draft.nextBillingDate).toBe('2026-02-28');
    });

    it('accepts an existing invoice that matches the same billing obligation', () => {
        const draft = action.buildGenerationDraft(
            claimedSubscription(),
            generationRequest(),
        );
        const existing = existingInvoice();

        expect(() =>
            action.resolveDuplicateOrThrow(existing, draft.invoice),
        ).not.toThrow();
    });

    it('rejects an existing invoice with inconsistent obligation data', () => {
        const draft = action.buildGenerationDraft(
            claimedSubscription(),
            generationRequest(),
        );

        expect(() =>
            action.resolveDuplicateOrThrow(undefined, draft.invoice),
        ).toThrow(InvoicePeriodConflictException);
        expect(() =>
            action.resolveDuplicateOrThrow(
                { ...existingInvoice(), currency: 'EUR' },
                draft.invoice,
            ),
        ).toThrow(InvoicePeriodConflictException);
        expect(() =>
            action.resolveDuplicateOrThrow(
                {
                    ...existingInvoice(),
                    billing_period_end: '2026-03-31',
                },
                draft.invoice,
            ),
        ).toThrow(InvoicePeriodConflictException);
    });

    it('continues catch-up only while due and below the configured period limit', () => {
        expect(
            action.canContinueCatchUp('2026-07-31', '2026-07-31', 2, 3),
        ).toBe(true);
        expect(
            action.canContinueCatchUp('2026-08-31', '2026-07-31', 2, 3),
        ).toBe(false);
        expect(
            action.isCatchUpLimitReached('2026-07-31', '2026-07-31', 2, 2),
        ).toBe(true);
    });
});
