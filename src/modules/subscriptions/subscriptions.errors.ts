import {
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';

export const SubscriptionErrorCode = {
    NotFound: 'SUBSCRIPTION_NOT_FOUND',
    InvalidDates: 'INVALID_SUBSCRIPTION_DATES',
    InvalidBillingAnchor: 'INVALID_BILLING_ANCHOR',
} as const;

export class SubscriptionNotFoundException extends NotFoundException {
    constructor() {
        super({
            code: SubscriptionErrorCode.NotFound,
            message: 'Subscription was not found',
        });
    }
}

export class InvalidSubscriptionDatesException extends UnprocessableEntityException {
    constructor() {
        super({
            code: SubscriptionErrorCode.InvalidDates,
            message: 'First billing date must be on or after the start date',
        });
    }
}

export class InvalidBillingAnchorException extends UnprocessableEntityException {
    constructor() {
        super({
            code: SubscriptionErrorCode.InvalidBillingAnchor,
            message: 'Billing anchor does not match the first billing date',
        });
    }
}
