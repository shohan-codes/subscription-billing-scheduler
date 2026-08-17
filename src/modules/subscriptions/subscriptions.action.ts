import { Injectable } from '@nestjs/common';
import { isBillingDateOnAnchor } from '../../common/billing-date';
import type { CreateSubscriptionRequest } from './subscriptions.dto';
import {
    InvalidBillingAnchorException,
    InvalidSubscriptionDatesException,
} from './subscriptions.errors';

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
