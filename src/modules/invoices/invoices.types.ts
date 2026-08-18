import type { Selectable } from 'kysely';
import type { CursorPage } from '../../common/dto/cursor-pagination.dto';
import type {
    InvoiceItemsTable,
    InvoicesTable,
} from '../../database/database.types';

export type InvoiceRecord = Selectable<InvoicesTable>;
export type InvoiceItemRecord = Selectable<InvoiceItemsTable>;

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
