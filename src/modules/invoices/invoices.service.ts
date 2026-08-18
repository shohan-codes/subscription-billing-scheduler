import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CursorCodec } from '../../common/utils/cursor-codec';
import { INVOICE_DATE_PATTERN } from './invoices.constant';
import {
    GetInvoiceRequest,
    GetInvoiceResponse,
    ListInvoicesRequest,
    ListInvoicesResponse,
} from './invoices.dto';
import { InvoicesRepository } from './invoices.repository';
import type { InvoiceListCursor } from './invoices.types';

@Injectable()
export class InvoicesService {
    constructor(
        private readonly repository: InvoicesRepository,
        private readonly cursorCodec: CursorCodec,
    ) {}

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
