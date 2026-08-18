import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CursorCodec } from '../../common/cursor-codec';
import { SubscriptionsAction } from './subscriptions.action';
import { SUBSCRIPTION_DATE_PATTERN } from './subscriptions.constant';
import {
    CreateSubscriptionRequest,
    CreateSubscriptionResponse,
    GetSubscriptionRequest,
    GetSubscriptionResponse,
    ListSubscriptionsRequest,
    ListSubscriptionsResponse,
} from './subscriptions.dto';
import { SubscriptionsRepository } from './subscriptions.repository';
import type { SubscriptionListCursor } from './subscriptions.types';

@Injectable()
export class SubscriptionsService {
    constructor(
        private readonly action: SubscriptionsAction,
        private readonly repository: SubscriptionsRepository,
        private readonly cursorCodec: CursorCodec,
    ) {}

    async create(
        request: CreateSubscriptionRequest,
    ): Promise<CreateSubscriptionResponse> {
        this.action.validateCreateOrThrow(request);
        const subscription = await this.repository.createOrThrow(request);

        return CreateSubscriptionResponse.from(subscription);
    }

    async get(
        request: GetSubscriptionRequest,
    ): Promise<GetSubscriptionResponse> {
        const subscription = await this.repository.findByIdOrThrow(request.id);
        const latestInvoice =
            (await this.repository.findLatestInvoice(subscription.id)) ?? null;

        return GetSubscriptionResponse.from({
            ...subscription,
            latestInvoice,
        });
    }

    async list(
        request: ListSubscriptionsRequest,
    ): Promise<ListSubscriptionsResponse> {
        const cursor = request.cursor
            ? this.cursorCodec.decodeOrThrow(
                  request.cursor,
                  isSubscriptionListCursor,
              )
            : undefined;
        const rows = await this.repository.list({
            status: request.status,
            billingState: request.billingState,
            customerReference: request.customerReference,
            dueBefore: request.dueBefore,
            cursor,
            limit: request.limit,
        });
        const hasMore = rows.length > request.limit;
        const items = hasMore ? rows.slice(0, request.limit) : rows;
        const last = items.at(-1);
        const nextCursor =
            hasMore && last
                ? this.cursorCodec.encode({
                      nextBillingDate: last.next_billing_date,
                      id: last.id,
                  })
                : null;

        return ListSubscriptionsResponse.from({
            items,
            pagination: { nextCursor, hasMore },
        });
    }
}

function isSubscriptionListCursor(
    payload: Record<string, unknown>,
): payload is SubscriptionListCursor {
    return (
        typeof payload.nextBillingDate === 'string' &&
        SUBSCRIPTION_DATE_PATTERN.test(payload.nextBillingDate) &&
        typeof payload.id === 'string' &&
        isUUID(payload.id) &&
        Object.keys(payload).length === 2
    );
}
