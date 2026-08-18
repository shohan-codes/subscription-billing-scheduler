import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
    BILLING_SCHEDULER_JOB_NAME,
    SchedulerRunStatus,
} from './billing-scheduler.constant';
import {
    SchedulerLeaseUnavailableException,
    SchedulerShuttingDownException,
} from './billing-scheduler.errors';
import type {
    SchedulerLeaseRequest,
    SchedulerRunCounters,
    SchedulerRunFailure,
    SchedulerRunRecord,
} from './billing-scheduler.types';

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

    /** Builds a bounded claim owner token for one scheduler run. */
    createClaimOwner(instanceId: string): string {
        const token = randomUUID();
        const maxInstanceLength = 120 - token.length - 1;
        return `${instanceId.slice(0, maxInstanceLength)}:${token}`;
    }

    /** Calculates the expiry timestamp for one subscription processing claim. */
    createClaimExpiry(now: Date, claimSeconds: number): Date {
        return new Date(now.getTime() + claimSeconds * 1000);
    }

    /** Rejects a trigger that begins after scheduler shutdown has started. */
    validateTriggerAllowedOrThrow(isShuttingDown: boolean): void {
        if (isShuttingDown) throw new SchedulerShuttingDownException();
    }

    /** Rejects a manual trigger when another coordinator already owns the lease. */
    validateManualRunOrThrow(run: SchedulerRunRecord): void {
        if (run.status === SchedulerRunStatus.SkippedLockUnavailable) {
            throw new SchedulerLeaseUnavailableException();
        }
    }

    /** Resolves the terminal success status from accumulated run counters. */
    resolveCompletedStatus(counters: SchedulerRunCounters): SchedulerRunStatus {
        return counters.failedCount > 0
            ? SchedulerRunStatus.CompletedWithErrors
            : SchedulerRunStatus.Completed;
    }

    /** Builds a safe top-level failure summary without exposing internal error details. */
    resolveSafeRunFailure(error: unknown): SchedulerRunFailure {
        void error;
        return {
            code: 'SCHEDULER_RUN_FAILED',
            message: 'Billing run failed unexpectedly',
        };
    }
}
