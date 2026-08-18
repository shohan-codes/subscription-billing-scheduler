import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type DatabaseClient } from '../../database/database.module';
import {
    SubscriptionBillingState,
    SubscriptionStatus,
} from './subscriptions.constant';
import type { CreateSubscriptionRequest } from './subscriptions.dto';
import { SubscriptionNotFoundException } from './subscriptions.errors';
import type {
    InvoiceRecord,
    SubscriptionListQuery,
    SubscriptionRecord,
} from './subscriptions.types';

@Injectable()
export class SubscriptionsRepository {
    constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

    /** Persists a new subscription and returns its stored state. */
    async createOrThrow(
        request: CreateSubscriptionRequest,
    ): Promise<SubscriptionRecord> {
        return this.database
            .insertInto('subscriptions')
            .values({
                id: randomUUID(),
                customer_reference: request.customerReference,
                description: request.description,
                status: SubscriptionStatus.Active,
                billing_state: SubscriptionBillingState.Ready,
                currency: request.currency,
                amount: request.amount,
                start_date: request.startDate,
                next_billing_date: request.firstBillingDate,
                billing_anchor_day: request.billingAnchorDay,
                anchor_is_month_end: request.anchorIsMonthEnd,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    /** Finds a subscription by ID or throws when missing. */
    async findByIdOrThrow(id: string): Promise<SubscriptionRecord> {
        const subscription = await this.findById(id);

        if (!subscription) throw new SubscriptionNotFoundException();
        return subscription;
    }

    /** Finds a subscription by ID. */
    findById(id: string): Promise<SubscriptionRecord | undefined> {
        return this.database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst();
    }

    /** Finds the most recent invoice for a subscription. */
    findLatestInvoice(
        subscriptionId: string,
    ): Promise<InvoiceRecord | undefined> {
        return this.database
            .selectFrom('invoices')
            .selectAll()
            .where('subscription_id', '=', subscriptionId)
            .orderBy('issue_date', 'desc')
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .executeTakeFirst();
    }

    /** Lists subscriptions using deterministic cursor pagination. */
    list(query: SubscriptionListQuery): Promise<SubscriptionRecord[]> {
        let statement = this.database.selectFrom('subscriptions').selectAll();

        if (query.status) {
            statement = statement.where('status', '=', query.status);
        }
        if (query.billingState) {
            statement = statement.where(
                'billing_state',
                '=',
                query.billingState,
            );
        }
        if (query.customerReference) {
            statement = statement.where(
                'customer_reference',
                '=',
                query.customerReference,
            );
        }
        if (query.dueBefore) {
            statement = statement.where(
                'next_billing_date',
                '<=',
                query.dueBefore,
            );
        }
        const cursor = query.cursor;
        if (cursor) {
            statement = statement.where((eb) =>
                eb.or([
                    eb('next_billing_date', '>', cursor.nextBillingDate),
                    eb.and([
                        eb('next_billing_date', '=', cursor.nextBillingDate),
                        eb('id', '>', cursor.id),
                    ]),
                ]),
            );
        }

        return statement
            .orderBy('next_billing_date', 'asc')
            .orderBy('id', 'asc')
            .limit(query.limit + 1)
            .execute();
    }
}
