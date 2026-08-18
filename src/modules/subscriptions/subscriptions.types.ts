import type { Selectable } from 'kysely';
import type { CursorPage } from '../../common/dto/cursor-pagination.dto';
import type {
    InvoicesTable,
    SubscriptionsTable,
} from '../../database/database.types';
import type {
    SubscriptionBillingState,
    SubscriptionStatus,
} from './subscriptions.constant';

export type SubscriptionRecord = Selectable<SubscriptionsTable>;
export type InvoiceRecord = Selectable<InvoicesTable>;

export type SubscriptionWithLatestInvoice = SubscriptionRecord & {
    latestInvoice: InvoiceRecord | null;
};

export type SubscriptionListCursor = {
    nextBillingDate: string;
    id: string;
};

export type SubscriptionListQuery = {
    status?: SubscriptionStatus;
    billingState?: SubscriptionBillingState;
    customerReference?: string;
    dueBefore?: string;
    cursor?: SubscriptionListCursor;
    limit: number;
};

export type SubscriptionListResult = CursorPage<SubscriptionRecord>;
