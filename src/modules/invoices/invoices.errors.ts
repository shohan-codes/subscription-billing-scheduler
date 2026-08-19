import { ConflictException, NotFoundException } from '@nestjs/common';

import { $invoice } from './invoices.constant';

export class InvoiceNotFoundException extends NotFoundException {
    constructor() {
        super({
            code: $invoice.errorCode.NOT_FOUND,
            message: 'Invoice was not found',
        });
    }
}

export class SubscriptionClaimLostException extends ConflictException {
    constructor() {
        super({
            code: $invoice.errorCode.SUBSCRIPTION_CLAIM_LOST,
            message:
                'Subscription processing claim is missing or no longer owned',
        });
    }
}

export class SubscriptionNotBillableException extends ConflictException {
    constructor(message: string) {
        super({
            code: $invoice.errorCode.SUBSCRIPTION_NOT_BILLABLE,
            message,
        });
    }
}

export class InvoicePeriodConflictException extends ConflictException {
    constructor() {
        super({
            code: $invoice.errorCode.PERIOD_CONFLICT,
            message:
                'Existing invoice does not match the expected billing obligation',
        });
    }
}
