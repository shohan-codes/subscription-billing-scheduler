import { Injectable } from '@nestjs/common';
import { daysInMonth } from '../../common/utils/calendar-date';
import {
    SubscriptionBillingState,
    SubscriptionStatus,
} from './subscriptions.constant';
import type {
    BillingRetrySubscriptionRequest,
    CreateSubscriptionRequest,
    UpdateSubscriptionRequest,
} from './subscriptions.dto';
import {
    EmptySubscriptionUpdateException,
    InvalidBillingAnchorException,
    InvalidSubscriptionDatesException,
    InvalidSubscriptionStateException,
    SubscriptionBillingRecoveryConflictException,
    SubscriptionProcessingClaimActiveException,
    SubscriptionStateConflictException,
    SubscriptionUnblockRequiredException,
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

    /** Calculates the next monthly billing date from the preserved subscription anchor. */
    nextMonthlyBillingDate(
        currentDate: string,
        anchorDay: number,
        anchorIsMonthEnd: boolean,
    ): string {
        const [year, month] = currentDate.split('-').map(Number);
        const nextYear = month === 12 ? year + 1 : year;
        const nextMonth = month === 12 ? 1 : month + 1;
        const monthEnd = daysInMonth(nextYear, nextMonth);
        const day = anchorIsMonthEnd ? monthEnd : Math.min(anchorDay, monthEnd);

        const formattedMonth = String(nextMonth).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');

        return `${nextYear}-${formattedMonth}-${formattedDay}`;
    }

    /** Resolves the paused status for a valid pause transition. */
    resolvePauseStatusOrThrow(current: SubscriptionRecord): SubscriptionStatus {
        if (current.status !== SubscriptionStatus.Active) {
            throw new SubscriptionStateConflictException(
                'Only active subscriptions can be paused',
            );
        }

        return SubscriptionStatus.Paused;
    }

    /** Resolves the active status for a valid resume transition. */
    resolveResumeStatusOrThrow(
        current: SubscriptionRecord,
    ): SubscriptionStatus {
        if (current.status !== SubscriptionStatus.Paused) {
            throw new SubscriptionStateConflictException(
                'Only paused subscriptions can be resumed',
            );
        }

        return SubscriptionStatus.Active;
    }

    /** Resolves the canceled status for a valid terminal transition. */
    resolveCancelStatusOrThrow(
        current: SubscriptionRecord,
    ): SubscriptionStatus {
        if (current.status === SubscriptionStatus.Canceled) {
            throw new SubscriptionStateConflictException(
                'Canceled subscription is terminal',
            );
        }

        return SubscriptionStatus.Canceled;
    }

    /** Validates whether an operator may clear the current billing failure state. */
    validateBillingRetryOrThrow(
        current: SubscriptionRecord,
        request: BillingRetrySubscriptionRequest,
    ): void {
        if (current.status === SubscriptionStatus.Canceled) {
            throw new SubscriptionBillingRecoveryConflictException(
                'Canceled subscription cannot be returned to billing',
            );
        }
        if (current.billing_state === SubscriptionBillingState.Ready) {
            throw new SubscriptionBillingRecoveryConflictException(
                'Subscription billing state is already ready',
            );
        }
        if (
            current.billing_state === SubscriptionBillingState.Blocked &&
            request.unblock !== true
        ) {
            throw new SubscriptionUnblockRequiredException();
        }
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
function isBillingDateOnAnchor(
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

/** Validates subscription schedule date order and anchor consistency. */
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

/** Checks whether an update request changes at least one editable field. */
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

/** Checks whether an update request changes the stored billing schedule. */
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
