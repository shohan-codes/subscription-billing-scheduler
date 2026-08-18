import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Clock } from '../../common/clock';
import { CursorCodec } from '../../common/utils/cursor-codec';
import { InvoicesAction } from './invoices.action';
import { INVOICE_DATE_PATTERN } from './invoices.constant';
import {
    GetInvoiceRequest,
    GetInvoiceResponse,
    ListInvoicesRequest,
    ListInvoicesResponse,
} from './invoices.dto';
import { InvoicesRepository } from './invoices.repository';
import type {
    GenerateClaimedInvoiceRequest,
    InvoiceGenerationResult,
    InvoiceListCursor,
} from './invoices.types';

@Injectable()
export class InvoicesService {
    constructor(
        private readonly repository: InvoicesRepository,
        private readonly action: InvoicesAction,
        private readonly cursorCodec: CursorCodec,
        private readonly clock: Clock,
    ) {}

    /** Processes one claimed subscription in a single invoice transaction. */
    generateClaimed(
        request: GenerateClaimedInvoiceRequest,
    ): Promise<InvoiceGenerationResult> {
        const startedAt = this.clock.now();

        return this.repository.withTransaction(async (transaction) => {
            const subscription =
                await transaction.findSubscriptionForUpdateOrThrow(
                    request.subscriptionId,
                );
            this.action.validateClaimedSubscriptionOrThrow(
                subscription,
                request,
                startedAt,
            );
            const draft = this.action.buildGenerationDraft(
                subscription,
                request,
            );
            const createdInvoice = await transaction.createInvoice(
                draft.invoice,
            );
            const duplicateCandidate = createdInvoice
                ? undefined
                : await transaction.findDuplicateCandidate(draft.invoice);
            const invoice =
                createdInvoice ??
                this.action.resolveDuplicateOrThrow(
                    duplicateCandidate,
                    draft.invoice,
                );
            const result = createdInvoice ? 'created' : 'duplicate_confirmed';

            if (createdInvoice) {
                await transaction.createItemOrThrow(draft.item);
            }

            await transaction.advanceSubscriptionOrThrow(
                subscription.id,
                request.runId,
                request.owner,
                subscription.next_billing_date,
                draft.nextBillingDate,
            );

            const completedAt = this.clock.now();

            await transaction.createRunItemOrThrow({
                id: randomUUID(),
                run_id: request.runId,
                subscription_id: subscription.id,
                result: createdInvoice ? 'success' : 'duplicate_confirmed',
                before_billing_date: subscription.next_billing_date,
                after_billing_date: draft.nextBillingDate,
                invoices_created: createdInvoice ? 1 : 0,
                error_type: null,
                error_code: null,
                error_message: null,
                started_at: startedAt,
                completed_at: completedAt,
            });
            const updated = await transaction.clearClaimOrThrow(
                subscription.id,
                request.runId,
                request.owner,
            );

            return {
                result,
                invoice,
                nextBillingDate: updated.next_billing_date,
            };
        });
    }

    /** Retrieves an invoice with its persisted line-item snapshots and scheduler run reference. */
    async get(request: GetInvoiceRequest): Promise<GetInvoiceResponse> {
        const invoice = await this.repository.findByIdOrThrow(request.id);
        const items = await this.repository.findItems(invoice.id);

        return GetInvoiceResponse.from({ ...invoice, items });
    }

    /** Lists invoice snapshots using filters and cursor pagination. */
    async list(request: ListInvoicesRequest): Promise<ListInvoicesResponse> {
        const cursor = request.cursor
            ? this.cursorCodec.decodeOrThrow(
                  request.cursor,
                  isInvoiceListCursor,
              )
            : undefined;
        const rows = await this.repository.list({
            subscriptionId: request.subscriptionId,
            customerReference: request.customerReference,
            billingPeriodStart: request.billingPeriodStart,
            billingPeriodEnd: request.billingPeriodEnd,
            issueDate: request.issueDate,
            cursor,
            limit: request.limit,
        });
        const hasMore = rows.length > request.limit;
        const items = hasMore ? rows.slice(0, request.limit) : rows;
        const last = items.at(-1);
        const nextCursor =
            hasMore && last
                ? this.cursorCodec.encode({
                      issueDate: last.issue_date,
                      id: last.id,
                  })
                : null;

        return ListInvoicesResponse.from({
            items,
            pagination: { nextCursor, hasMore },
        });
    }
}

/** Validates the decoded cursor shape used by invoice listing. */
function isInvoiceListCursor(
    payload: Record<string, unknown>,
): payload is InvoiceListCursor {
    return (
        typeof payload.issueDate === 'string' &&
        INVOICE_DATE_PATTERN.test(payload.issueDate) &&
        typeof payload.id === 'string' &&
        isUUID(payload.id) &&
        Object.keys(payload).length === 2
    );
}
