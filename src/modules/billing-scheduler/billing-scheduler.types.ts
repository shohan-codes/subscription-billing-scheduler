import type { Insertable, Selectable } from 'kysely';
import type { CursorPage } from '../../common/dto/cursor-pagination.dto';
import type {
    SchedulerLocksTable,
    SchedulerRunItemsTable,
    SchedulerRunsTable,
} from '../../database/database.types';
import type {
    SchedulerRunItemResult,
    SchedulerRunStatus,
    SchedulerTriggerType,
} from './billing-scheduler.constant';

export type SchedulerLeaseRecord = Selectable<SchedulerLocksTable>;
export type SchedulerRunRecord = Selectable<SchedulerRunsTable>;
export type SchedulerRunItemRecord = Selectable<SchedulerRunItemsTable>;
export type SchedulerRunInsert = Insertable<SchedulerRunsTable>;

export interface SchedulerLeaseRequest {
    lockName: string;
    ownerToken: string;
    acquiredAt: Date;
    leaseExpiresAt: Date;
}

export interface SchedulerHeartbeatContext {
    lockName: string;
    ownerToken: string;
    runId?: string;
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
