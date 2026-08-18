import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type DatabaseClient } from '../../database/database.module';
import {
    SubscriptionBillingState,
    SubscriptionStatus,
} from './subscriptions.constant';
import type {
    CreateSubscriptionRequest,
    UpdateSubscriptionRequest,
} from './subscriptions.dto';
import {
    SubscriptionBillingRecoveryConflictException,
    SubscriptionNotFoundException,
    SubscriptionStateConflictException,
    SubscriptionVersionConflictException,
} from './subscriptions.errors';
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

    /** Updates a subscription only when its version and processing claim still permit it. */
    async updateOrThrow(
        id: string,
        request: UpdateSubscriptionRequest,
        scheduleChanged: boolean,
        now: Date,
    ): Promise<SubscriptionRecord> {
        let statement = this.database
            .updateTable('subscriptions')
            .set({
                ...(request.description !== undefined && {
                    description: request.description,
                }),
                ...(request.amount !== undefined && { amount: request.amount }),
                ...(request.currency !== undefined && {
                    currency: request.currency,
                }),
                ...(request.nextBillingDate !== undefined && {
                    next_billing_date: request.nextBillingDate,
                }),
                ...(request.billingAnchorDay !== undefined && {
                    billing_anchor_day: request.billingAnchorDay,
                }),
                ...(request.anchorIsMonthEnd !== undefined && {
                    anchor_is_month_end: request.anchorIsMonthEnd,
                }),
                version: sql<number>`version + 1`,
            })
            .where('id', '=', id)
            .where('version', '=', request.version);

        if (scheduleChanged) {
            statement = statement.where((eb) =>
                eb.or([
                    eb('processing_expires_at', 'is', null),
                    eb('processing_expires_at', '<=', now),
                ]),
            );
        }

        const subscription = await statement.returningAll().executeTakeFirst();

        if (!subscription) throw new SubscriptionVersionConflictException();
        return subscription;
    }

    /** Changes lifecycle status only when the previously read status is still current. */
    async transitionStatusOrThrow(
        id: string,
        expectedStatus: SubscriptionStatus,
        status: SubscriptionStatus,
    ): Promise<SubscriptionRecord> {
        const subscription = await this.database
            .updateTable('subscriptions')
            .set({
                status,
                version: sql<number>`version + 1`,
            })
            .where('id', '=', id)
            .where('status', '=', expectedStatus)
            .returningAll()
            .executeTakeFirst();

        if (!subscription) throw new SubscriptionStateConflictException();
        return subscription;
    }

    /** Clears a retry or blocked billing state only when the previously read state is unchanged. */
    async recoverBillingStateOrThrow(
        id: string,
        expectedState: SubscriptionBillingState,
    ): Promise<SubscriptionRecord> {
        const subscription = await this.database
            .updateTable('subscriptions')
            .set({
                billing_state: SubscriptionBillingState.Ready,
                billing_retry_at: null,
                version: sql<number>`version + 1`,
            })
            .where('id', '=', id)
            .where('billing_state', '=', expectedState)
            .returningAll()
            .executeTakeFirst();

        if (!subscription) {
            throw new SubscriptionBillingRecoveryConflictException(
                'Subscription billing state changed before recovery completed',
            );
        }
        return subscription;
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
