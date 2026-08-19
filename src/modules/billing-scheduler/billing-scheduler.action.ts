import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
    InvoicePeriodConflictException,
    SubscriptionClaimLostException,
    SubscriptionNotBillableException,
} from '../invoices/invoices.errors';
import {
    BILLING_SCHEDULER_JOB_NAME,
    SchedulerRunStatus,
} from './billing-scheduler.constant';
import {
    SchedulerLeaseUnavailableException,
    SchedulerShuttingDownException,
} from './billing-scheduler.errors';
import type {
    BillingItemFailure,
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

    /** Classifies an item failure and calculates safe persisted retry metadata. */
    classifyItemFailure(
        error: unknown,
        currentFailureCount: number,
        now: Date,
    ): BillingItemFailure {
        if (error instanceof SubscriptionClaimLostException) {
            return {
                type: 'lease_lost',
                code: 'SUBSCRIPTION_CLAIM_LOST',
                message: 'Subscription processing ownership was lost',
                failureCount: currentFailureCount,
                retryAt: null,
            };
        }
        if (error instanceof InvoicePeriodConflictException) {
            return this.permanentFailure(
                'INVOICE_PERIOD_CONFLICT',
                'Existing invoice conflicts with the expected billing period',
                currentFailureCount,
            );
        }
        if (error instanceof SubscriptionNotBillableException) {
            return this.permanentFailure(
                'SUBSCRIPTION_NOT_BILLABLE',
                'Subscription is no longer billable for this run',
                currentFailureCount,
            );
        }
        if (isTransientDatabaseError(error)) {
            const failureCount = currentFailureCount + 1;
            return {
                type: 'transient',
                code: 'DATABASE_TRANSIENT_FAILURE',
                message:
                    'A temporary database error interrupted subscription billing',
                failureCount,
                retryAt: this.resolveRetryAt(now, failureCount),
            };
        }

        return this.permanentFailure(
            'BILLING_ITEM_FAILED',
            'Subscription billing failed because of an unrecoverable item error',
            currentFailureCount,
        );
    }

    /** Builds a safe interrupted item outcome for lease loss or application shutdown. */
    resolveInterruptedItemFailure(
        leaseLost: boolean,
        currentFailureCount: number,
    ): BillingItemFailure {
        return leaseLost
            ? {
                  type: 'lease_lost',
                  code: 'SCHEDULER_LEASE_LOST',
                  message: 'Scheduler lease ownership was lost',
                  failureCount: currentFailureCount,
                  retryAt: null,
              }
            : {
                  type: 'shutdown_interrupted',
                  code: 'SHUTDOWN_INTERRUPTED',
                  message:
                      'Application shutdown interrupted subscription billing',
                  failureCount: currentFailureCount,
                  retryAt: null,
              };
    }

    /** Calculates the capped retry timestamp for the consecutive transient failure count. */
    resolveRetryAt(now: Date, failureCount: number): Date {
        const delays = [60, 300, 900, 3600, 21_600] as const;
        const index = Math.min(
            Math.max(failureCount - 1, 0),
            delays.length - 1,
        );
        return new Date(now.getTime() + delays[index] * 1000);
    }

    /** Builds persisted metadata for a permanent billing failure. */
    private permanentFailure(
        code: string,
        message: string,
        failureCount: number,
    ): BillingItemFailure {
        return {
            type: 'permanent',
            code,
            message,
            failureCount,
            retryAt: null,
        };
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

/** Detects PostgreSQL failures that are safe to retry automatically. */
function isTransientDatabaseError(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    const code = (error as { code?: unknown }).code;
    if (typeof code !== 'string') return false;

    return new Set([
        '40001',
        '40P01',
        '55P03',
        '08000',
        '08001',
        '08003',
        '08006',
        '08007',
        '08P01',
        '57P01',
        '57P02',
        '57P03',
    ]).has(code);
}
