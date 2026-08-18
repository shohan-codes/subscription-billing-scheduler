import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
    SubscriptionBillingState,
    SubscriptionStatus,
} from '../subscriptions/subscriptions.constant';
import { SubscriptionsAction } from '../subscriptions/subscriptions.action';
import type { SubscriptionRecord } from '../subscriptions/subscriptions.types';
import { InvoiceStatus } from './invoices.constant';
import {
    InvoicePeriodConflictException,
    SubscriptionClaimLostException,
    SubscriptionNotBillableException,
} from './invoices.errors';
import type {
    GenerateClaimedInvoiceRequest,
    InvoiceGenerationDraft,
    InvoiceInsert,
    InvoiceRecord,
} from './invoices.types';

@Injectable()
export class InvoicesAction {
    constructor(private readonly subscriptionsAction: SubscriptionsAction) {}

    /** Validates that a locked subscription still belongs to the expected active claim. */
    validateClaimedSubscriptionOrThrow(
        subscription: SubscriptionRecord,
        request: GenerateClaimedInvoiceRequest,
        now: Date,
    ): void {
        if (
            subscription.processing_run_id !== request.runId ||
            subscription.processing_owner !== request.owner ||
            !subscription.processing_expires_at ||
            subscription.processing_expires_at.getTime() <= now.getTime()
        ) {
            throw new SubscriptionClaimLostException();
        }
        if (subscription.status !== SubscriptionStatus.Active) {
            throw new SubscriptionNotBillableException(
                'Subscription is not active',
            );
        }
        if (subscription.billing_state === SubscriptionBillingState.Blocked) {
            throw new SubscriptionNotBillableException(
                'Blocked subscription cannot be billed automatically',
            );
        }
        if (
            subscription.billing_state === SubscriptionBillingState.RetryWait &&
            subscription.billing_retry_at &&
            subscription.billing_retry_at.getTime() > now.getTime()
        ) {
            throw new SubscriptionNotBillableException(
                'Subscription retry delay has not elapsed',
            );
        }
        if (subscription.next_billing_date > request.cutoffDate) {
            throw new SubscriptionNotBillableException(
                'Subscription is not due for the run cutoff date',
            );
        }
    }

    /** Resolves a duplicate candidate or throws when it does not match the expected obligation. */
    resolveDuplicateOrThrow(
        existing: InvoiceRecord | undefined,
        expected: InvoiceInsert,
    ): InvoiceRecord {
        if (
            !existing ||
            existing.subscription_id !== expected.subscription_id ||
            existing.billing_period_start !== expected.billing_period_start ||
            existing.billing_period_end !== expected.billing_period_end ||
            existing.currency !== expected.currency
        ) {
            throw new InvoicePeriodConflictException();
        }

        return existing;
    }

    /** Builds the baseline invoice, line-item snapshots, and following billing date. */
    buildGenerationDraft(
        subscription: SubscriptionRecord,
        request: GenerateClaimedInvoiceRequest,
    ): InvoiceGenerationDraft {
        const nextBillingDate = this.subscriptionsAction.nextMonthlyBillingDate(
            subscription.next_billing_date,
            subscription.billing_anchor_day,
            subscription.anchor_is_month_end,
        );
        const invoiceId = randomUUID();

        return {
            invoice: {
                id: invoiceId,
                invoice_number: buildInvoiceNumber(
                    request.cutoffDate,
                    invoiceId,
                ),
                subscription_id: subscription.id,
                customer_reference: subscription.customer_reference,
                billing_period_start: subscription.next_billing_date,
                billing_period_end: nextBillingDate,
                issue_date: request.cutoffDate,
                status: InvoiceStatus.Issued,
                currency: subscription.currency,
                subtotal: subscription.amount,
                tax_total: '0.0000',
                discount_total: '0.0000',
                total: subscription.amount,
                idempotency_key: buildIdempotencyKey(
                    subscription.id,
                    subscription.next_billing_date,
                    nextBillingDate,
                ),
                generated_by_run_id: request.runId,
            },
            item: {
                id: randomUUID(),
                invoice_id: invoiceId,
                description: subscription.description,
                quantity: '1.0000',
                unit_price: subscription.amount,
                line_total: subscription.amount,
            },
            nextBillingDate,
        };
    }
}

/** Builds a stable idempotency key from a subscription and canonical billing period. */
function buildIdempotencyKey(
    subscriptionId: string,
    periodStart: string,
    periodEnd: string,
): string {
    return `invoice:${subscriptionId}:${periodStart}:${periodEnd}`;
}

/** Builds a compact unique invoice number for a generated invoice. */
function buildInvoiceNumber(issueDate: string, invoiceId: string): string {
    return `INV-${issueDate.replaceAll('-', '')}-${invoiceId.slice(0, 8).toUpperCase()}`;
}
