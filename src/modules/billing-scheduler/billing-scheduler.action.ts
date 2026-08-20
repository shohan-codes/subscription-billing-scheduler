import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { $database } from '../../database/database.constant';
import {
    InvoicePeriodConflictException,
    SubscriptionClaimLostException,
    SubscriptionNotBillableException,
} from '../invoices/invoices.errors';
import { $invoice } from '../invoices/invoices.constant';
import {
    $billingScheduler,
    type SchedulerRunStatus,
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
            lockName: $billingScheduler.job.NAME,
            ownerToken: `${instanceId}:${randomUUID()}`,
            acquiredAt: now,
            leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
        };
    }

    /** Builds a bounded claim owner token for one scheduler run. */
    createClaimOwner(instanceId: string): string {
        const token = randomUUID();
        const maxInstanceLength =
            $database.subscription.processingOwner.MAX_LENGTH -
            token.length -
            1;
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
                type: $billingScheduler.failureType.LEASE_LOST,
                code: $invoice.errorCode.SUBSCRIPTION_CLAIM_LOST,
                message: 'Subscription processing ownership was lost',
                failureCount: currentFailureCount,
                retryAt: null,
            };
        }
        if (error instanceof InvoicePeriodConflictException) {
            return this.permanentFailure(
                $invoice.errorCode.PERIOD_CONFLICT,
                'Existing invoice conflicts with the expected billing period',
                currentFailureCount,
            );
        }
        if (error instanceof SubscriptionNotBillableException) {
            return this.permanentFailure(
                $invoice.errorCode.SUBSCRIPTION_NOT_BILLABLE,
                'Subscription is no longer billable for this run',
                currentFailureCount,
            );
        }
        if (isTransientDatabaseError(error)) {
            const failureCount = currentFailureCount + 1;
            return {
                type: $billingScheduler.failureType.TRANSIENT,
                code: $billingScheduler.errorCode.DATABASE_TRANSIENT_FAILURE,
                message:
                    'A temporary database error interrupted subscription billing',
                failureCount,
                retryAt: this.resolveRetryAt(now, failureCount),
            };
        }

        return this.permanentFailure(
            $billingScheduler.errorCode.BILLING_ITEM_FAILED,
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
                  type: $billingScheduler.failureType.LEASE_LOST,
                  code: $billingScheduler.errorCode.LEASE_LOST,
                  message: 'Scheduler lease ownership was lost',
                  failureCount: currentFailureCount,
                  retryAt: null,
              }
            : {
                  type: $billingScheduler.failureType.SHUTDOWN_INTERRUPTED,
                  code: $billingScheduler.errorCode.SHUTDOWN_INTERRUPTED,
                  message:
                      'Application shutdown interrupted subscription billing',
                  failureCount: currentFailureCount,
                  retryAt: null,
              };
    }

    /** Calculates the capped retry timestamp for the consecutive transient failure count. */
    resolveRetryAt(now: Date, failureCount: number): Date {
        const index = Math.min(
            Math.max(failureCount - 1, 0),
            $billingScheduler.retry.DELAYS_SECONDS.length - 1,
        );
        return new Date(
            now.getTime() +
                $billingScheduler.retry.DELAYS_SECONDS[index] * 1000,
        );
    }

    /** Builds persisted metadata for a permanent billing failure. */
    private permanentFailure(
        code: string,
        message: string,
        failureCount: number,
    ): BillingItemFailure {
        return {
            type: $billingScheduler.failureType.PERMANENT,
            code,
            message,
            failureCount,
            retryAt: null,
        };
    }

    /** Calculates the heartbeat threshold used to abandon stale running scheduler records. */
    createStaleRunThreshold(now: Date, leaseSeconds: number): Date {
        return new Date(now.getTime() - leaseSeconds * 1000);
    }

    /** Resolves the next batch size without exceeding the configured run item limit. */
    resolveClaimBatchLimit(
        batchSize: number,
        claimedCount: number,
        maxItemsPerRun: number,
    ): number {
        return Math.max(0, Math.min(batchSize, maxItemsPerRun - claimedCount));
    }

    /** Detects whether the configured maximum scheduler run duration has elapsed. */
    isRunDurationLimitReached(
        startedAt: Date,
        now: Date,
        maxRunSeconds: number,
    ): boolean {
        return now.getTime() - startedAt.getTime() >= maxRunSeconds * 1000;
    }

    /** Rejects a trigger that begins after scheduler shutdown has started. */
    validateTriggerAllowedOrThrow(isShuttingDown: boolean): void {
        if (isShuttingDown) throw new SchedulerShuttingDownException();
    }

    /** Rejects a manual trigger when another coordinator already owns the lease. */
    validateManualRunOrThrow(run: SchedulerRunRecord): void {
        if (
            run.status === $billingScheduler.runStatus.SKIPPED_LOCK_UNAVAILABLE
        ) {
            throw new SchedulerLeaseUnavailableException();
        }
    }

    /** Resolves the terminal success status from accumulated run counters. */
    resolveCompletedStatus(counters: SchedulerRunCounters): SchedulerRunStatus {
        return counters.failedCount > 0
            ? $billingScheduler.runStatus.COMPLETED_WITH_ERRORS
            : $billingScheduler.runStatus.COMPLETED;
    }

    /** Builds a safe top-level failure summary without exposing internal error details. */
    resolveSafeRunFailure(error: unknown): SchedulerRunFailure {
        void error;
        return {
            code: $billingScheduler.errorCode.RUN_FAILED,
            message: 'Billing run failed unexpectedly',
        };
    }
}

/** Detects PostgreSQL failures that are safe to retry automatically. */
function isTransientDatabaseError(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    const code = (error as { code?: unknown }).code;
    if (typeof code !== 'string') return false;

    return Object.values($database.postgres.transientErrorCode).some(
        (transientCode) => transientCode === code,
    );
}
