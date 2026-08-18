import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type DatabaseClient } from '../../database/database.module';
import { InvoiceNotFoundException } from './invoices.errors';
import type {
    InvoiceItemRecord,
    InvoiceListQuery,
    InvoiceRecord,
} from './invoices.types';

@Injectable()
export class InvoicesRepository {
    constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

    /** Finds an invoice by ID or throws when missing. */
    async findByIdOrThrow(id: string): Promise<InvoiceRecord> {
        const invoice = await this.findById(id);

        if (!invoice) throw new InvoiceNotFoundException();
        return invoice;
    }

    /** Finds an invoice by ID. */
    findById(id: string): Promise<InvoiceRecord | undefined> {
        return this.database
            .selectFrom('invoices')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst();
    }

    /** Lists invoice line items in stable creation order. */
    findItems(invoiceId: string): Promise<InvoiceItemRecord[]> {
        return this.database
            .selectFrom('invoice_items')
            .selectAll()
            .where('invoice_id', '=', invoiceId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();
    }

    /** Lists invoices using filters and deterministic cursor pagination. */
    list(query: InvoiceListQuery): Promise<InvoiceRecord[]> {
        let statement = this.database.selectFrom('invoices').selectAll();

        if (query.subscriptionId) {
            statement = statement.where(
                'subscription_id',
                '=',
                query.subscriptionId,
            );
        }
        if (query.customerReference) {
            statement = statement.where(
                'customer_reference',
                '=',
                query.customerReference,
            );
        }
        if (query.billingPeriodStart) {
            statement = statement.where(
                'billing_period_start',
                '=',
                query.billingPeriodStart,
            );
        }
        if (query.billingPeriodEnd) {
            statement = statement.where(
                'billing_period_end',
                '=',
                query.billingPeriodEnd,
            );
        }
        if (query.issueDate) {
            statement = statement.where('issue_date', '=', query.issueDate);
        }
        const cursor = query.cursor;
        if (cursor) {
            statement = statement.where((eb) =>
                eb.or([
                    eb('issue_date', '<', cursor.issueDate),
                    eb.and([
                        eb('issue_date', '=', cursor.issueDate),
                        eb('id', '<', cursor.id),
                    ]),
                ]),
            );
        }

        return statement
            .orderBy('issue_date', 'desc')
            .orderBy('id', 'desc')
            .limit(query.limit + 1)
            .execute();
    }
}
