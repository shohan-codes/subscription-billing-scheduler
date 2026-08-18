import { ConflictException, NotFoundException } from '@nestjs/common';

const InvoiceErrorCode = {
    NotFound: 'INVOICE_NOT_FOUND',
    ClaimLost: 'SUBSCRIPTION_CLAIM_LOST',
    NotBillable: 'SUBSCRIPTION_NOT_BILLABLE',
    PeriodConflict: 'INVOICE_PERIOD_CONFLICT',
} as const;

export class InvoiceNotFoundException extends NotFoundException {
    constructor() {
        super({
            code: InvoiceErrorCode.NotFound,
            message: 'Invoice was not found',
        });
    }
}

export class SubscriptionClaimLostException extends ConflictException {
    constructor() {
        super({
            code: InvoiceErrorCode.ClaimLost,
            message:
                'Subscription processing claim is missing or no longer owned',
        });
    }
}

export class SubscriptionNotBillableException extends ConflictException {
    constructor(message: string) {
        super({
            code: InvoiceErrorCode.NotBillable,
            message,
        });
    }
}

export class InvoicePeriodConflictException extends ConflictException {
    constructor() {
        super({
            code: InvoiceErrorCode.PeriodConflict,
            message:
                'Existing invoice does not match the expected billing obligation',
        });
    }
}
