import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Clock } from '../../common/clock';
import { CursorCodec } from '../../common/utils/cursor-codec';
import { SubscriptionsAction } from './subscriptions.action';
import { $subscription } from './subscriptions.constant';
import {
    BillingRetrySubscriptionRequest,
    BillingRetrySubscriptionResponse,
    CancelSubscriptionResponse,
    CreateSubscriptionRequest,
    CreateSubscriptionResponse,
    GetSubscriptionRequest,
    GetSubscriptionResponse,
    ListSubscriptionsRequest,
    ListSubscriptionsResponse,
    PauseSubscriptionResponse,
    ResumeSubscriptionResponse,
    UpdateSubscriptionRequest,
    UpdateSubscriptionResponse,
} from './subscriptions.dto';
import { SubscriptionsRepository } from './subscriptions.repository';
import type { SubscriptionListCursor } from './subscriptions.types';

@Injectable()
export class SubscriptionsService {
    constructor(
        private readonly action: SubscriptionsAction,
        private readonly repository: SubscriptionsRepository,
        private readonly cursorCodec: CursorCodec,
        private readonly clock: Clock,
    ) {}

    /** Creates a subscription after validating business rules. */
    async create(
        request: CreateSubscriptionRequest,
    ): Promise<CreateSubscriptionResponse> {
        this.action.validateCreateOrThrow(request);
        const subscription = await this.repository.createOrThrow(request);

        return CreateSubscriptionResponse.from(subscription);
    }

    /** Updates allowed subscription fields using optimistic concurrency. */
    async update(
        id: string,
        request: UpdateSubscriptionRequest,
    ): Promise<UpdateSubscriptionResponse> {
        const current = await this.repository.findByIdOrThrow(id);
        const now = this.clock.now();
        const scheduleChanged = this.action.validateUpdateOrThrow(
            current,
            request,
            now,
        );
        const subscription = await this.repository.updateOrThrow(
            id,
            request,
            scheduleChanged,
            now,
        );

        return UpdateSubscriptionResponse.from(subscription);
    }

    /** Clears retry delay or explicitly unblocks a corrected subscription. */
    async billingRetry(
        id: string,
        request: BillingRetrySubscriptionRequest,
    ): Promise<BillingRetrySubscriptionResponse> {
        const current = await this.repository.findByIdOrThrow(id);
        this.action.validateBillingRetryOrThrow(current, request);
        const subscription = await this.repository.recoverBillingStateOrThrow(
            id,
            current.billing_state,
            current.version,
        );

        return BillingRetrySubscriptionResponse.from(subscription);
    }

    /** Pauses an active subscription without changing its next billing date. */
    async pause(id: string): Promise<PauseSubscriptionResponse> {
        const current = await this.repository.findByIdOrThrow(id);
        const status = this.action.resolvePauseStatusOrThrow(current);
        const subscription = await this.repository.transitionStatusOrThrow(
            id,
            current.status,
            status,
        );

        return PauseSubscriptionResponse.from(subscription);
    }

    /** Resumes a paused subscription without advancing its next billing date. */
    async resume(id: string): Promise<ResumeSubscriptionResponse> {
        const current = await this.repository.findByIdOrThrow(id);
        const status = this.action.resolveResumeStatusOrThrow(current);
        const subscription = await this.repository.transitionStatusOrThrow(
            id,
            current.status,
            status,
        );

        return ResumeSubscriptionResponse.from(subscription);
    }

    /** Cancels an active or paused subscription terminally. */
    async cancel(id: string): Promise<CancelSubscriptionResponse> {
        const current = await this.repository.findByIdOrThrow(id);
        const status = this.action.resolveCancelStatusOrThrow(current);
        const subscription = await this.repository.transitionStatusOrThrow(
            id,
            current.status,
            status,
        );

        return CancelSubscriptionResponse.from(subscription);
    }

    /** Retrieves a subscription with its latest invoice summary. */
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

    /** Lists subscriptions using filters and cursor pagination. */
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

/** Validates the decoded cursor shape used by subscription listing. */
function isSubscriptionListCursor(
    payload: Record<string, unknown>,
): payload is SubscriptionListCursor {
    return (
        typeof payload.nextBillingDate === 'string' &&
        $subscription.pattern.DATE.test(payload.nextBillingDate) &&
        typeof payload.id === 'string' &&
        isUUID(payload.id) &&
        Object.keys(payload).length === 2
    );
}
