import { Injectable } from '@nestjs/common';
import { daysInMonth } from '../../common/billing-date';
import { SubscriptionStatus } from './subscriptions.constant';
import type {
    CreateSubscriptionRequest,
    UpdateSubscriptionRequest,
} from './subscriptions.dto';
import {
    EmptySubscriptionUpdateException,
    InvalidBillingAnchorException,
    InvalidSubscriptionDatesException,
    InvalidSubscriptionStateException,
    SubscriptionProcessingClaimActiveException,
    SubscriptionVersionConflictException,
} from './subscriptions.errors';
import type { SubscriptionRecord } from './subscriptions.types';

@Injectable()
export class SubscriptionsAction {
    /** Validates cross-field business rules for subscription creation. */
    validateCreateOrThrow(request: CreateSubscriptionRequest): void {
        validateScheduleOrThrow(
            request.startDate,
            request.firstBillingDate,
            request.billingAnchorDay,
            request.anchorIsMonthEnd,
        );
    }

    /** Validates a controlled subscription update and returns whether its schedule changes. */
    validateUpdateOrThrow(
        current: SubscriptionRecord,
        request: UpdateSubscriptionRequest,
        now: Date,
    ): boolean {
        if (!hasUpdateFields(request)) {
            throw new EmptySubscriptionUpdateException();
        }
        if (request.version !== current.version) {
            throw new SubscriptionVersionConflictException();
        }

        const scheduleChanged = hasScheduleChanges(current, request);
        if (!scheduleChanged) return false;

        if (current.status === SubscriptionStatus.Canceled) {
            throw new InvalidSubscriptionStateException();
        }
        if (
            current.processing_expires_at &&
            current.processing_expires_at.getTime() > now.getTime()
        ) {
            throw new SubscriptionProcessingClaimActiveException();
        }

        validateScheduleOrThrow(
            current.start_date,
            request.nextBillingDate ?? current.next_billing_date,
            request.billingAnchorDay ?? current.billing_anchor_day,
            request.anchorIsMonthEnd ?? current.anchor_is_month_end,
        );

        return true;
    }
}

/** Checks whether a calendar date matches the preserved monthly billing anchor. */
export function isBillingDateOnAnchor(
    date: string,
    anchorDay: number,
    isMonthEnd: boolean,
): boolean {
    const [year, month, day] = date.split('-').map(Number);
    const monthEnd = daysInMonth(year, month);

    return isMonthEnd
        ? day === monthEnd
        : day === Math.min(anchorDay, monthEnd);
}

function validateScheduleOrThrow(
    startDate: string,
    billingDate: string,
    anchorDay: number,
    isMonthEnd: boolean,
): void {
    if (billingDate < startDate) {
        throw new InvalidSubscriptionDatesException();
    }
    if (!isBillingDateOnAnchor(billingDate, anchorDay, isMonthEnd)) {
        throw new InvalidBillingAnchorException();
    }
}

function hasUpdateFields(request: UpdateSubscriptionRequest): boolean {
    return (
        request.description !== undefined ||
        request.amount !== undefined ||
        request.currency !== undefined ||
        request.nextBillingDate !== undefined ||
        request.billingAnchorDay !== undefined ||
        request.anchorIsMonthEnd !== undefined
    );
}

function hasScheduleChanges(
    current: SubscriptionRecord,
    request: UpdateSubscriptionRequest,
): boolean {
    return (
        (request.nextBillingDate !== undefined &&
            request.nextBillingDate !== current.next_billing_date) ||
        (request.billingAnchorDay !== undefined &&
            request.billingAnchorDay !== current.billing_anchor_day) ||
        (request.anchorIsMonthEnd !== undefined &&
            request.anchorIsMonthEnd !== current.anchor_is_month_end)
    );
}
