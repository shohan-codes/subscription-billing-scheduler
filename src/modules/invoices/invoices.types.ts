import type { Insertable, Selectable } from 'kysely';
import type { CursorPage } from '../../common/dto/cursor-pagination.dto';
import type { InvoiceGenerationOutcome } from './invoices.constant';
import type {
    InvoiceItemsTable,
    InvoicesTable,
    SchedulerRunItemsTable,
} from '../../database/database.types';

export type InvoiceRecord = Selectable<InvoicesTable>;
export type InvoiceItemRecord = Selectable<InvoiceItemsTable>;
export type SchedulerRunItemRecord = Selectable<SchedulerRunItemsTable>;
export type InvoiceInsert = Insertable<InvoicesTable>;
export type InvoiceItemInsert = Insertable<InvoiceItemsTable>;
export type SchedulerRunItemInsert = Insertable<SchedulerRunItemsTable>;

export type InvoiceDetailRecord = InvoiceRecord & {
    items: InvoiceItemRecord[];
};

export type InvoiceListCursor = {
    issueDate: string;
    id: string;
};

export type InvoiceListQuery = {
    subscriptionId?: string;
    customerReference?: string;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
    issueDate?: string;
    cursor?: InvoiceListCursor;
    limit: number;
};

export type InvoiceListResult = CursorPage<InvoiceRecord>;

export type GenerateClaimedInvoiceRequest = {
    subscriptionId: string;
    runId: string;
    owner: string;
    cutoffDate: string;
};

export type GenerateClaimedCatchUpRequest = GenerateClaimedInvoiceRequest & {
    maxPeriods: number;
};

export type InvoiceGenerationDraft = {
    invoice: InvoiceInsert;
    item: InvoiceItemInsert;
    nextBillingDate: string;
};

export type InvoiceGenerationResult = {
    result: InvoiceGenerationOutcome;
    invoice: InvoiceRecord;
    nextBillingDate: string;
};

export type InvoiceCatchUpResult = {
    result: InvoiceGenerationOutcome;
    invoices: InvoiceRecord[];
    nextBillingDate: string;
    periodsProcessed: number;
    invoicesCreated: number;
    limitReached: boolean;
};
