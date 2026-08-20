import type { Insertable, Selectable } from 'kysely';
import type { CursorPage } from '../../common/dto/cursor-pagination.dto';
import type {
    SchedulerLocksTable,
    SchedulerRunItemsTable,
    SchedulerRunsTable,
    SubscriptionsTable,
} from '../../database/database.types';
import type { SubscriptionBillingState } from '../subscriptions/subscriptions.constant';
import type {
    BillingItemFailureType,
    SchedulerRunItemResult,
    SchedulerRunStatus,
    SchedulerTriggerType,
} from './billing-scheduler.constant';

export type SchedulerLeaseRecord = Selectable<SchedulerLocksTable>;
export type SchedulerRunRecord = Selectable<SchedulerRunsTable>;
export type SchedulerRunItemRecord = Selectable<SchedulerRunItemsTable>;
export type SchedulerRunItemInsert = Insertable<SchedulerRunItemsTable>;
export type SchedulerRunInsert = Insertable<SchedulerRunsTable>;
export type DueSubscriptionRecord = Selectable<SubscriptionsTable>;

export interface SchedulerLeaseRequest {
    lockName: string;
    ownerToken: string;
    acquiredAt: Date;
    leaseExpiresAt: Date;
}

export interface DueSubscriptionBatchQuery {
    cutoffDate: string;
    now: Date;
    limit: number;
}

export interface SubscriptionBatchClaimQuery extends DueSubscriptionBatchQuery {
    runId: string;
    owner: string;
    claimStartedAt: Date;
    claimExpiresAt: Date;
}

export interface SubscriptionBatchClaimResult {
    subscriptions: DueSubscriptionRecord[];
    expiredClaimCount: number;
}

export interface BillingDueCount {
    billingState: SubscriptionBillingState;
    count: number;
}

export interface SchedulerHeartbeatContext {
    lockName: string;
    ownerToken: string;
    runId?: string;
}

export interface BillingItemFailure {
    type: BillingItemFailureType;
    code: string;
    message: string;
    failureCount: number;
    retryAt: Date | null;
}

export interface SchedulerItemFailurePersistence {
    subscriptionId: string;
    runId: string;
    owner: string;
    beforeBillingDate: string;
    startedAt: Date;
    completedAt: Date;
    failure: BillingItemFailure;
}

export interface SchedulerRunCounters {
    eligibleCount: number;
    claimedCount: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
    invoicesCreatedCount: number;
}

export interface SchedulerRunFinalization {
    status: SchedulerRunStatus;
    completedAt: Date;
    counters: SchedulerRunCounters;
    errorCode?: string | null;
    errorMessage?: string | null;
}

export interface SchedulerRunFailure {
    code: string;
    message: string;
}

export type SchedulerRunListCursor = {
    triggeredAt: string;
    id: string;
};

export type SchedulerRunListQuery = {
    triggerType?: SchedulerTriggerType;
    status?: SchedulerRunStatus;
    cursor?: SchedulerRunListCursor;
    limit: number;
};

export type SchedulerRunListResult = CursorPage<SchedulerRunRecord>;

export type SchedulerRunItemListCursor = {
    startedAt: string;
    id: string;
};

export type SchedulerRunItemListQuery = {
    runId: string;
    result?: SchedulerRunItemResult;
    errorCode?: string;
    cursor?: SchedulerRunItemListCursor;
    limit: number;
};

export type SchedulerRunItemListResult = CursorPage<SchedulerRunItemRecord>;
