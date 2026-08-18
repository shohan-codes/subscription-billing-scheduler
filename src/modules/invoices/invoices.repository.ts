import { Inject, Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DATABASE, type DatabaseClient } from '../../database/database.module';
import type { DatabaseSchema } from '../../database/database.types';
import type { SubscriptionRecord } from '../subscriptions/subscriptions.types';
import {
    InvoiceNotFoundException,
    SubscriptionClaimLostException,
} from './invoices.errors';
import type {
    InvoiceInsert,
    InvoiceItemInsert,
    InvoiceItemRecord,
    InvoiceListQuery,
    InvoiceRecord,
    SchedulerRunItemInsert,
    SchedulerRunItemRecord,
} from './invoices.types';

@Injectable()
export class InvoicesRepository {
    constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

    /** Runs invoice persistence work inside one Kysely transaction. */
    withTransaction<T>(
        work: (repository: InvoiceTransactionRepository) => Promise<T>,
    ): Promise<T> {
        return this.database
            .transaction()
            .execute((transaction) =>
                work(new InvoiceTransactionRepository(transaction)),
            );
    }

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

export class InvoiceTransactionRepository {
    constructor(private readonly database: Transaction<DatabaseSchema>) {}

    /** Locks a subscription row for invoice processing or throws when missing. */
    async findSubscriptionForUpdateOrThrow(
        id: string,
    ): Promise<SubscriptionRecord> {
        const subscription = await this.findSubscriptionForUpdate(id);

        if (!subscription) throw new SubscriptionClaimLostException();
        return subscription;
    }

    /** Locks a subscription row for invoice processing. */
    findSubscriptionForUpdate(
        id: string,
    ): Promise<SubscriptionRecord | undefined> {
        return this.database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', id)
            .forUpdate()
            .executeTakeFirst();
    }

    /** Persists an invoice snapshot inside the active transaction. */
    createInvoiceOrThrow(invoice: InvoiceInsert): Promise<InvoiceRecord> {
        return this.database
            .insertInto('invoices')
            .values(invoice)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    /** Persists an invoice line-item snapshot inside the active transaction. */
    createItemOrThrow(item: InvoiceItemInsert): Promise<InvoiceItemRecord> {
        return this.database
            .insertInto('invoice_items')
            .values(item)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    /** Advances a claimed subscription or throws when ownership no longer matches. */
    async advanceSubscriptionOrThrow(
        id: string,
        runId: string,
        owner: string,
        expectedBillingDate: string,
        nextBillingDate: string,
    ): Promise<SubscriptionRecord> {
        const subscription = await this.advanceSubscription(
            id,
            runId,
            owner,
            expectedBillingDate,
            nextBillingDate,
        );

        if (!subscription) throw new SubscriptionClaimLostException();
        return subscription;
    }

    /** Advances the billing date and resets the persisted failure state. */
    advanceSubscription(
        id: string,
        runId: string,
        owner: string,
        expectedBillingDate: string,
        nextBillingDate: string,
    ): Promise<SubscriptionRecord | undefined> {
        return this.database
            .updateTable('subscriptions')
            .set({
                next_billing_date: nextBillingDate,
                billing_state: 'ready',
                billing_failure_count: 0,
                billing_retry_at: null,
                last_billing_error_code: null,
                last_billing_error_message: null,
                version: sql<number>`version + 1`,
            })
            .where('id', '=', id)
            .where('processing_run_id', '=', runId)
            .where('processing_owner', '=', owner)
            .where('next_billing_date', '=', expectedBillingDate)
            .returningAll()
            .executeTakeFirst();
    }

    /** Clears the current run's owned subscription claim or throws when ownership changed. */
    async clearClaimOrThrow(
        id: string,
        runId: string,
        owner: string,
    ): Promise<SubscriptionRecord> {
        const subscription = await this.clearClaim(id, runId, owner);

        if (!subscription) throw new SubscriptionClaimLostException();
        return subscription;
    }

    /** Clears only the subscription claim still owned by the current run. */
    clearClaim(
        id: string,
        runId: string,
        owner: string,
    ): Promise<SubscriptionRecord | undefined> {
        return this.database
            .updateTable('subscriptions')
            .set({
                processing_run_id: null,
                processing_owner: null,
                processing_started_at: null,
                processing_expires_at: null,
            })
            .where('id', '=', id)
            .where('processing_run_id', '=', runId)
            .where('processing_owner', '=', owner)
            .returningAll()
            .executeTakeFirst();
    }

    /** Persists a successful scheduler run item inside the active transaction. */
    createRunItemOrThrow(
        item: SchedulerRunItemInsert,
    ): Promise<SchedulerRunItemRecord> {
        return this.database
            .insertInto('scheduler_run_items')
            .values(item)
            .returningAll()
            .executeTakeFirstOrThrow();
    }
}
