import {
    BadRequestException,
    ConflictException,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';

import { $subscription } from './subscriptions.constant';

export class SubscriptionNotFoundException extends NotFoundException {
    constructor() {
        super({
            code: $subscription.errorCode.NOT_FOUND,
            message: 'Subscription was not found',
        });
    }
}

export class EmptySubscriptionUpdateException extends BadRequestException {
    constructor() {
        super({
            code: $subscription.errorCode.EMPTY_UPDATE,
            message: 'At least one subscription field must be provided',
        });
    }
}

export class SubscriptionVersionConflictException extends ConflictException {
    constructor() {
        super({
            code: $subscription.errorCode.VERSION_CONFLICT,
            message: 'Subscription version is stale',
        });
    }
}

export class SubscriptionProcessingClaimActiveException extends ConflictException {
    constructor() {
        super({
            code: $subscription.errorCode.PROCESSING_CLAIM_ACTIVE,
            message:
                'Subscription schedule cannot be changed while processing is active',
        });
    }
}

export class SubscriptionStateConflictException extends ConflictException {
    constructor(
        message = 'Subscription state changed or transition is not allowed',
    ) {
        super({
            code: $subscription.errorCode.STATE_CONFLICT,
            message,
        });
    }
}

export class SubscriptionBillingRecoveryConflictException extends ConflictException {
    constructor(message = 'Subscription billing state cannot be recovered') {
        super({
            code: $subscription.errorCode.BILLING_RECOVERY_CONFLICT,
            message,
        });
    }
}

export class SubscriptionUnblockRequiredException extends ConflictException {
    constructor() {
        super({
            code: $subscription.errorCode.EXPLICIT_UNBLOCK_REQUIRED,
            message:
                'Blocked subscription requires an explicit unblock request',
        });
    }
}

export class InvalidSubscriptionStateException extends UnprocessableEntityException {
    constructor() {
        super({
            code: $subscription.errorCode.INVALID_STATE,
            message: 'Canceled subscription schedule cannot be changed',
        });
    }
}

export class InvalidSubscriptionDatesException extends UnprocessableEntityException {
    constructor() {
        super({
            code: $subscription.errorCode.INVALID_DATES,
            message: 'First billing date must be on or after the start date',
        });
    }
}

export class InvalidBillingAnchorException extends UnprocessableEntityException {
    constructor() {
        super({
            code: $subscription.errorCode.INVALID_BILLING_ANCHOR,
            message: 'Billing anchor does not match the first billing date',
        });
    }
}
