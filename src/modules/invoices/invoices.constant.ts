import { $database } from '../../database/database.constant';

export const $invoice = {
    status: $database.invoice.status,
    generationOutcome: {
        CREATED: 'created',
        DUPLICATE_CONFIRMED: 'duplicate_confirmed',
    },
    errorCode: {
        NOT_FOUND: 'INVOICE_NOT_FOUND',
        SUBSCRIPTION_CLAIM_LOST: 'SUBSCRIPTION_CLAIM_LOST',
        SUBSCRIPTION_NOT_BILLABLE: 'SUBSCRIPTION_NOT_BILLABLE',
        PERIOD_CONFLICT: 'INVOICE_PERIOD_CONFLICT',
    },
    pattern: {
        DATE: /^\d{4}-\d{2}-\d{2}$/,
    },
} as const;

export type InvoiceStatus =
    (typeof $invoice.status)[keyof typeof $invoice.status];
export type InvoiceGenerationOutcome =
    (typeof $invoice.generationOutcome)[keyof typeof $invoice.generationOutcome];
