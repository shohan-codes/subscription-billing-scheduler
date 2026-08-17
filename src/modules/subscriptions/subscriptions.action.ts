import { Injectable } from '@nestjs/common';
import type { CreateSubscriptionRequest } from './subscriptions.dto';
import {
    InvalidBillingAnchorException,
    InvalidSubscriptionDatesException,
} from './subscriptions.errors';
import { daysInMonth } from '../../common/billing-date';

@Injectable()
export class SubscriptionsAction {
    /** Validates cross-field business rules for subscription creation. */
    validateCreateOrThrow(request: CreateSubscriptionRequest): void {
        if (request.firstBillingDate < request.startDate) {
            throw new InvalidSubscriptionDatesException();
        }

        if (
            !isBillingDateOnAnchor(
                request.firstBillingDate,
                request.billingAnchorDay,
                request.anchorIsMonthEnd,
            )
        ) {
            throw new InvalidBillingAnchorException();
        }
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
