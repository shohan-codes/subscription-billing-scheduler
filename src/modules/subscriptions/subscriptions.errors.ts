import {
    BadRequestException,
    ConflictException,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';

export const SubscriptionErrorCode = {
    NotFound: 'SUBSCRIPTION_NOT_FOUND',
    EmptyUpdate: 'EMPTY_SUBSCRIPTION_UPDATE',
    VersionConflict: 'SUBSCRIPTION_VERSION_CONFLICT',
    ProcessingClaimActive: 'SUBSCRIPTION_PROCESSING_CLAIM_ACTIVE',
    InvalidState: 'INVALID_SUBSCRIPTION_STATE',
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

export class EmptySubscriptionUpdateException extends BadRequestException {
    constructor() {
        super({
            code: SubscriptionErrorCode.EmptyUpdate,
            message: 'At least one subscription field must be provided',
        });
    }
}

export class SubscriptionVersionConflictException extends ConflictException {
    constructor() {
        super({
            code: SubscriptionErrorCode.VersionConflict,
            message: 'Subscription version is stale',
        });
    }
}

export class SubscriptionProcessingClaimActiveException extends ConflictException {
    constructor() {
        super({
            code: SubscriptionErrorCode.ProcessingClaimActive,
            message:
                'Subscription schedule cannot be changed while processing is active',
        });
    }
}

export class InvalidSubscriptionStateException extends UnprocessableEntityException {
    constructor() {
        super({
            code: SubscriptionErrorCode.InvalidState,
            message: 'Canceled subscription schedule cannot be changed',
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
