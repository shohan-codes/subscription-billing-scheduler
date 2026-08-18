import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BILLING_SCHEDULER_JOB_NAME } from './billing-scheduler.constant';
import type { SchedulerLeaseRequest } from './billing-scheduler.types';

@Injectable()
export class BillingSchedulerAction {
    /** Builds a fresh coordinator lease request for the current trigger attempt. */
    createLeaseRequest(
        now: Date,
        instanceId: string,
        leaseSeconds: number,
    ): SchedulerLeaseRequest {
        return {
            lockName: BILLING_SCHEDULER_JOB_NAME,
            ownerToken: `${instanceId}:${randomUUID()}`,
            acquiredAt: now,
            leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
        };
    }
}
