import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type DatabaseClient } from '../../database/database.module';
import {
    SubscriptionBillingState,
    SubscriptionStatus,
} from './subscriptions.constant';
import type { CreateSubscriptionRequest } from './subscriptions.dto';
import type { SubscriptionRecord } from './subscriptions.types';

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
}
