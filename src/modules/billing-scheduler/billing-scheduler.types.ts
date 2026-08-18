import type { Selectable } from 'kysely';
import type { SchedulerLocksTable } from '../../database/database.types';

export type SchedulerLeaseRecord = Selectable<SchedulerLocksTable>;

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
