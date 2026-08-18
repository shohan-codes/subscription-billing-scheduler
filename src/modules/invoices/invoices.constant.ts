import type { InvoicesTable } from '../../database/database.types';

export const InvoiceStatus = {
    Issued: 'issued',
} as const satisfies Record<string, InvoicesTable['status']>;

export type InvoiceStatus =
    (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const INVOICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
