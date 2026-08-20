import { randomUUID } from 'node:crypto';
import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { isISO8601, isUUID } from 'class-validator';
import { AppLogger } from '../../common/app-logger';
import { Clock } from '../../common/clock';
import { ShutdownState } from '../../common/shutdown-state';
import { CursorCodec } from '../../common/utils/cursor-codec';
import { AppConfigService } from '../../config/app-config.service';
import { $invoice } from '../invoices/invoices.constant';
import { InvoicesService } from '../invoices/invoices.service';
import { BillingSchedulerAction } from './billing-scheduler.action';
import {
    $billingScheduler,
    type SchedulerProcessingStopReason,
    type SchedulerTriggerType,
} from './billing-scheduler.constant';
import {
    GetBillingRunRequest,
    GetBillingRunResponse,
    ListBillingRunItemsRequest,
    ListBillingRunItemsResponse,
    ListBillingRunsRequest,
    ListBillingRunsResponse,
    TriggerBillingRunResponse,
} from './billing-scheduler.dto';
import { BillingSchedulerHeartbeat } from './billing-scheduler.heartbeat';
import { BillingSchedulerMetrics } from './billing-scheduler.metrics';
import { BillingSchedulerRepository } from './billing-scheduler.repository';
import type {
    SchedulerRunCounters,
    SchedulerRunItemListCursor,
    SchedulerRunListCursor,
    SchedulerRunRecord,
} from './billing-scheduler.types';

const EMPTY_COUNTERS: SchedulerRunCounters = {
    eligibleCount: 0,
    claimedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    invoicesCreatedCount: 0,
};

@Injectable()
export class BillingSchedulerService implements BeforeApplicationShutdown {
    private readonly inFlight = new Set<Promise<unknown>>();

    constructor(
        private readonly config: AppConfigService,
        private readonly clock: Clock,
        private readonly shutdownState: ShutdownState,
        private readonly action: BillingSchedulerAction,
        private readonly repository: BillingSchedulerRepository,
        private readonly heartbeat: BillingSchedulerHeartbeat,
        private readonly invoices: InvoicesService,
        private readonly cursorCodec: CursorCodec,
        private readonly logger: AppLogger,
        private readonly metrics: BillingSchedulerMetrics,
    ) {}

    /** Starts the scheduler coordinator path for a scheduled trigger. */
    async triggerScheduled(): Promise<void> {
        if (this.shutdownState.isShuttingDown) {
            this.logger.info(
                $billingScheduler.logEvent.TRIGGER_SKIPPED_SHUTDOWN,
            );
            return;
        }

        try {
            await this.track(
                this.coordinate($billingScheduler.triggerType.SCHEDULED),
            );
        } catch {
            this.logger.error($billingScheduler.logEvent.TRIGGER_FAILED, {
                errorCode: $billingScheduler.errorCode.TRIGGER_FAILED,
            });
        }
    }

    /** Starts an operator-requested billing run through the same coordinator path. */
    async triggerManual(): Promise<TriggerBillingRunResponse> {
        this.action.validateTriggerAllowedOrThrow(
            this.shutdownState.isShuttingDown,
        );
        const run = await this.track(
            this.coordinate($billingScheduler.triggerType.MANUAL),
        );
        this.action.validateManualRunOrThrow(run);

        return TriggerBillingRunResponse.from(run);
    }

    /** Retrieves one persisted scheduler run. */
    async getRun(
        request: GetBillingRunRequest,
    ): Promise<GetBillingRunResponse> {
        const run = await this.repository.findRunByIdOrThrow(request.id);
        return GetBillingRunResponse.from(run);
    }

    /** Lists persisted scheduler run attempts using cursor pagination. */
    async listRuns(
        request: ListBillingRunsRequest,
    ): Promise<ListBillingRunsResponse> {
        const cursor = request.cursor
            ? this.cursorCodec.decodeOrThrow(
                  request.cursor,
                  isSchedulerRunListCursor,
              )
            : undefined;
        const rows = await this.repository.listRuns({
            triggerType: request.triggerType,
            status: request.status,
            cursor,
            limit: request.limit,
        });
        const hasMore = rows.length > request.limit;
        const items = hasMore ? rows.slice(0, request.limit) : rows;
        const last = items.at(-1);
        const nextCursor =
            hasMore && last
                ? this.cursorCodec.encode({
                      triggeredAt: last.triggered_at.toISOString(),
                      id: last.id,
                  })
                : null;

        return ListBillingRunsResponse.from({
            items,
            pagination: { nextCursor, hasMore },
        });
    }

    /** Lists persisted item outcomes for one scheduler run. */
    async listRunItems(
        runId: string,
        request: ListBillingRunItemsRequest,
    ): Promise<ListBillingRunItemsResponse> {
        await this.repository.findRunByIdOrThrow(runId);
        const cursor = request.cursor
            ? this.cursorCodec.decodeOrThrow(
                  request.cursor,
                  isSchedulerRunItemListCursor,
              )
            : undefined;
        const rows = await this.repository.listRunItems({
            runId,
            result: request.result,
            errorCode: request.errorCode,
            cursor,
            limit: request.limit,
        });
        const hasMore = rows.length > request.limit;
        const items = hasMore ? rows.slice(0, request.limit) : rows;
        const last = items.at(-1);
        const nextCursor =
            hasMore && last
                ? this.cursorCodec.encode({
                      startedAt: last.started_at.toISOString(),
                      id: last.id,
                  })
                : null;

        return ListBillingRunItemsResponse.from({
            items,
            pagination: { nextCursor, hasMore },
        });
    }

    /** Stops new scheduler work and waits up to the configured run bound for active attempts. */
    async beforeApplicationShutdown(): Promise<void> {
        this.shutdownState.beginShutdown();
        await this.waitForInFlight();
    }

    /** Tracks an in-flight coordinator attempt until it settles. */
    private track<T>(work: Promise<T>): Promise<T> {
        this.inFlight.add(work);
        void work.then(
            () => this.inFlight.delete(work),
            () => this.inFlight.delete(work),
        );
        return work;
    }

    /** Waits for active coordinator attempts without exceeding the configured shutdown bound. */
    private async waitForInFlight(): Promise<void> {
        if (this.inFlight.size === 0) return;

        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<boolean>((resolve) => {
            timeout = setTimeout(
                () => resolve(true),
                this.config.billing.MAX_RUN_SECONDS * 1000,
            );
        });
        const completed = Promise.allSettled([...this.inFlight]).then(
            () => false,
        );
        const didTimeOut = await Promise.race([completed, timedOut]);
        if (timeout) clearTimeout(timeout);

        if (didTimeOut) {
            this.logger.warn($billingScheduler.logEvent.SHUTDOWN_TIMEOUT, {
                inFlightCount: this.inFlight.size,
            });
        }
    }

    /** Claims and processes due subscriptions until the current eligible set is exhausted. */
    private async processClaimedBatches(
        run: SchedulerRunRecord,
        claimOwner: string,
        counters: SchedulerRunCounters,
    ): Promise<SchedulerProcessingStopReason> {
        const startedAt = run.started_at ?? run.triggered_at;

        while (true) {
            if (this.heartbeat.isLeaseLost) {
                return $billingScheduler.processingStopReason.LEASE_LOST;
            }
            if (this.shutdownState.isShuttingDown) {
                return $billingScheduler.processingStopReason
                    .SHUTDOWN_INTERRUPTED;
            }

            const now = this.clock.now();
            if (
                this.action.isRunDurationLimitReached(
                    startedAt,
                    now,
                    this.config.billing.MAX_RUN_SECONDS,
                )
            ) {
                return $billingScheduler.processingStopReason.RUN_LIMIT_REACHED;
            }
            const batchLimit = this.action.resolveClaimBatchLimit(
                this.config.billing.BATCH_SIZE,
                counters.claimedCount,
                this.config.billing.MAX_ITEMS_PER_RUN,
            );
            if (batchLimit === 0) {
                return $billingScheduler.processingStopReason.RUN_LIMIT_REACHED;
            }

            const claimed = await this.repository.claimDueBatchWithStats({
                cutoffDate: run.cutoff_date,
                now,
                limit: batchLimit,
                runId: run.id,
                owner: claimOwner,
                claimStartedAt: now,
                claimExpiresAt: this.action.createClaimExpiry(
                    now,
                    this.config.billing.CLAIM_SECONDS,
                ),
            });
            const batch = claimed.subscriptions;
            this.metrics.recordExpiredClaims(claimed.expiredClaimCount);

            if (batch.length === 0) {
                return $billingScheduler.processingStopReason.EXHAUSTED;
            }

            counters.eligibleCount += batch.length;
            counters.claimedCount += batch.length;

            for (const subscription of batch) {
                if (this.heartbeat.isLeaseLost) {
                    return $billingScheduler.processingStopReason.LEASE_LOST;
                }
                if (this.shutdownState.isShuttingDown) {
                    return $billingScheduler.processingStopReason
                        .SHUTDOWN_INTERRUPTED;
                }

                const itemStartedAt = this.clock.now();
                if (
                    this.action.isRunDurationLimitReached(
                        startedAt,
                        itemStartedAt,
                        this.config.billing.MAX_RUN_SECONDS,
                    )
                ) {
                    return $billingScheduler.processingStopReason
                        .RUN_LIMIT_REACHED;
                }
                this.metrics.recordScheduleLag(
                    run.cutoff_date,
                    subscription.next_billing_date,
                );

                try {
                    const result = await this.invoices.generateClaimedCatchUp({
                        subscriptionId: subscription.id,
                        runId: run.id,
                        owner: claimOwner,
                        cutoffDate: run.cutoff_date,
                        maxPeriods: this.config.billing.MAX_CATCH_UP_PERIODS,
                    });
                    const completedAt = this.clock.now();
                    const itemResult =
                        result.invoicesCreated > 0
                            ? $billingScheduler.runItemResult.SUCCESS
                            : $billingScheduler.runItemResult
                                  .DUPLICATE_CONFIRMED;
                    const durationMs = elapsedMs(itemStartedAt, completedAt);
                    counters.succeededCount += 1;
                    counters.invoicesCreatedCount += result.invoicesCreated;
                    this.metrics.recordItem(
                        itemResult,
                        $billingScheduler.metricLabel.NONE,
                        durationMs,
                    );
                    this.metrics.recordInvoices(result.createdCurrencies);
                    this.logger.info(
                        $billingScheduler.logEvent.ITEM_COMPLETED,
                        {
                            runId: run.id,
                            subscriptionId: subscription.id,
                            durationMs,
                            result: itemResult,
                            invoicesCreated: result.invoicesCreated,
                        },
                    );
                } catch (error) {
                    const completedAt = this.clock.now();
                    const failure = this.action.classifyItemFailure(
                        error,
                        subscription.billing_failure_count,
                        completedAt,
                    );

                    if (
                        failure.type ===
                            $billingScheduler.failureType.LEASE_LOST ||
                        failure.type ===
                            $billingScheduler.failureType.SHUTDOWN_INTERRUPTED
                    ) {
                        await this.repository.createRunItemOrThrow({
                            id: randomUUID(),
                            run_id: run.id,
                            subscription_id: subscription.id,
                            result: $billingScheduler.runItemResult.SKIPPED,
                            before_billing_date: subscription.next_billing_date,
                            after_billing_date: null,
                            invoices_created: 0,
                            error_type: null,
                            error_code: failure.code,
                            error_message: failure.message,
                            started_at: itemStartedAt,
                            completed_at: completedAt,
                        });
                        const durationMs = elapsedMs(
                            itemStartedAt,
                            this.clock.now(),
                        );
                        counters.skippedCount += 1;
                        this.metrics.recordItem(
                            $billingScheduler.runItemResult.SKIPPED,
                            failure.code,
                            durationMs,
                        );
                        this.logger.warn(
                            $billingScheduler.logEvent.ITEM_SKIPPED,
                            {
                                runId: run.id,
                                subscriptionId: subscription.id,
                                durationMs,
                                result: $billingScheduler.runItemResult.SKIPPED,
                                errorCode: failure.code,
                            },
                        );
                        continue;
                    }

                    const recorded = await this.repository.recordItemFailure({
                        subscriptionId: subscription.id,
                        runId: run.id,
                        owner: claimOwner,
                        beforeBillingDate: subscription.next_billing_date,
                        startedAt: itemStartedAt,
                        completedAt,
                        failure,
                    });
                    const durationMs = elapsedMs(
                        itemStartedAt,
                        this.clock.now(),
                    );

                    if (recorded) {
                        counters.failedCount += 1;
                        this.metrics.recordItem(
                            $billingScheduler.runItemResult.FAILED,
                            failure.code,
                            durationMs,
                        );
                        this.logger.warn(
                            $billingScheduler.logEvent.ITEM_FAILED,
                            {
                                runId: run.id,
                                subscriptionId: subscription.id,
                                durationMs,
                                result: $billingScheduler.runItemResult.FAILED,
                                errorCode: failure.code,
                            },
                        );
                    } else {
                        counters.skippedCount += 1;
                        this.metrics.recordItem(
                            $billingScheduler.runItemResult.SKIPPED,
                            $invoice.errorCode.SUBSCRIPTION_CLAIM_LOST,
                            durationMs,
                        );
                        this.logger.warn(
                            $billingScheduler.logEvent.ITEM_CLAIM_LOST,
                            {
                                runId: run.id,
                                subscriptionId: subscription.id,
                                durationMs,
                                result: $billingScheduler.runItemResult.SKIPPED,
                                errorCode:
                                    $invoice.errorCode.SUBSCRIPTION_CLAIM_LOST,
                            },
                        );
                    }
                }
            }
        }
    }

    /** Coordinates one scheduled or manual trigger around lease ownership and run history. */
    private async coordinate(
        triggerType: SchedulerTriggerType,
    ): Promise<SchedulerRunRecord> {
        this.action.validateTriggerAllowedOrThrow(
            this.shutdownState.isShuttingDown,
        );
        const triggeredAt = this.clock.now();
        const cutoffDate = this.clock.dateInTimeZone(
            this.config.billing.TIMEZONE,
            triggeredAt,
        );
        const leaseRequest = this.action.createLeaseRequest(
            triggeredAt,
            this.config.app.INSTANCE_ID,
            this.config.billing.LEASE_SECONDS,
        );
        const lease = await this.repository.acquireLease(leaseRequest);

        if (!lease) {
            const completedAt = this.clock.now();
            const skipped = await this.repository.createRunOrThrow({
                id: randomUUID(),
                job_name: $billingScheduler.job.NAME,
                trigger_type: triggerType,
                triggered_at: triggeredAt,
                cutoff_date: cutoffDate,
                status: $billingScheduler.runStatus.SKIPPED_LOCK_UNAVAILABLE,
                instance_id: this.config.app.INSTANCE_ID,
                lease_owner_token: null,
                started_at: null,
                completed_at: completedAt,
                last_heartbeat_at: null,
                eligible_count: 0,
                claimed_count: 0,
                succeeded_count: 0,
                failed_count: 0,
                skipped_count: 0,
                invoices_created_count: 0,
                error_code: $billingScheduler.errorCode.LEASE_UNAVAILABLE,
                error_message:
                    'Another coordinator owns the active scheduler lease',
            });
            this.metrics.recordLeaseContention(leaseRequest.lockName);
            await this.observeTerminalRun(skipped);
            return skipped;
        }

        const staleBefore = this.action.createStaleRunThreshold(
            triggeredAt,
            this.config.billing.LEASE_SECONDS,
        );
        const abandoned = await this.repository.abandonStaleRuns(
            $billingScheduler.job.NAME,
            staleBefore,
            triggeredAt,
        );
        if (abandoned.length > 0) {
            this.logger.warn(
                $billingScheduler.logEvent.RUN_ABANDONED_RECOVERED,
                {
                    abandonedCount: abandoned.length,
                },
            );
        }

        let run: SchedulerRunRecord | undefined;
        const counters: SchedulerRunCounters = { ...EMPTY_COUNTERS };

        try {
            run = await this.repository.createRunOrThrow({
                id: randomUUID(),
                job_name: $billingScheduler.job.NAME,
                trigger_type: triggerType,
                triggered_at: triggeredAt,
                cutoff_date: cutoffDate,
                status: $billingScheduler.runStatus.RUNNING,
                instance_id: this.config.app.INSTANCE_ID,
                lease_owner_token: lease.owner_token,
                started_at: triggeredAt,
                completed_at: null,
                last_heartbeat_at: triggeredAt,
                eligible_count: 0,
                claimed_count: 0,
                succeeded_count: 0,
                failed_count: 0,
                skipped_count: 0,
                invoices_created_count: 0,
                error_code: null,
                error_message: null,
            });
            await this.refreshDueMetrics(run.cutoff_date, triggeredAt);
            this.heartbeat.start({
                lockName: lease.lock_name,
                ownerToken: lease.owner_token,
                runId: run.id,
            });
            this.logger.info($billingScheduler.logEvent.RUN_STARTED, {
                runId: run.id,
                triggerType,
                result: $billingScheduler.runStatus.RUNNING,
            });
            const claimOwner = this.action.createClaimOwner(
                this.config.app.INSTANCE_ID,
            );
            const stopReason = await this.processClaimedBatches(
                run,
                claimOwner,
                counters,
            );

            if (
                stopReason !== $billingScheduler.processingStopReason.EXHAUSTED
            ) {
                const interrupted = await this.repository.finalizeRunOrThrow(
                    run.id,
                    lease.owner_token,
                    {
                        status: $billingScheduler.runStatus.INTERRUPTED,
                        completedAt: this.clock.now(),
                        counters,
                        errorCode:
                            stopReason ===
                            $billingScheduler.processingStopReason.LEASE_LOST
                                ? $billingScheduler.errorCode.LEASE_LOST
                                : stopReason ===
                                    $billingScheduler.processingStopReason
                                        .RUN_LIMIT_REACHED
                                  ? $billingScheduler.errorCode
                                        .RUN_LIMIT_REACHED
                                  : $billingScheduler.errorCode
                                        .SHUTDOWN_INTERRUPTED,
                        errorMessage:
                            stopReason ===
                            $billingScheduler.processingStopReason.LEASE_LOST
                                ? 'Scheduler lease ownership was lost'
                                : stopReason ===
                                    $billingScheduler.processingStopReason
                                        .RUN_LIMIT_REACHED
                                  ? 'Billing run stopped at a configured safety limit'
                                  : 'Billing run was interrupted by application shutdown',
                    },
                );
                await this.observeTerminalRun(interrupted);
                return interrupted;
            }

            const completed = await this.repository.finalizeRunOrThrow(
                run.id,
                lease.owner_token,
                {
                    status: this.action.resolveCompletedStatus(counters),
                    completedAt: this.clock.now(),
                    counters,
                },
            );
            await this.observeTerminalRun(completed);
            return completed;
        } catch (error) {
            if (!run) throw error;

            const failure = this.action.resolveSafeRunFailure(error);
            const failed = await this.repository.finalizeRun(
                run.id,
                lease.owner_token,
                {
                    status: $billingScheduler.runStatus.FAILED,
                    completedAt: this.clock.now(),
                    counters,
                    errorCode: failure.code,
                    errorMessage: failure.message,
                },
            );

            if (failed) {
                await this.observeTerminalRun(failed);
                return failed;
            }
            throw error;
        } finally {
            this.heartbeat.stop();
            const released = await this.repository.releaseLease(
                lease.lock_name,
                lease.owner_token,
            );
            this.logger.info($billingScheduler.logEvent.LEASE_RELEASED, {
                ...(run ? { runId: run.id } : {}),
                jobName: lease.lock_name,
                released,
            });
        }
    }

    /** Records terminal run metrics, logs, and a best-effort due-count snapshot. */
    private async observeTerminalRun(run: SchedulerRunRecord): Promise<void> {
        const completedAt = run.completed_at ?? this.clock.now();
        const durationMs = elapsedMs(
            run.started_at ?? run.triggered_at,
            completedAt,
        );
        this.metrics.recordRun(run, durationMs);
        await this.refreshDueMetrics(run.cutoff_date, completedAt);
        const fields = {
            runId: run.id,
            triggerType: run.trigger_type,
            durationMs,
            result: run.status,
            eligibleCount: run.eligible_count,
            claimedCount: run.claimed_count,
            succeededCount: run.succeeded_count,
            failedCount: run.failed_count,
            skippedCount: run.skipped_count,
            invoicesCreatedCount: run.invoices_created_count,
            ...(run.error_code ? { errorCode: run.error_code } : {}),
        };

        if (run.status === $billingScheduler.runStatus.FAILED) {
            this.logger.error($billingScheduler.logEvent.RUN_FAILED, fields);
            return;
        }
        if (
            run.status === $billingScheduler.runStatus.SKIPPED_LOCK_UNAVAILABLE
        ) {
            this.logger.info($billingScheduler.logEvent.RUN_SKIPPED, fields);
            return;
        }
        this.logger.info($billingScheduler.logEvent.RUN_COMPLETED, fields);
    }

    /** Refreshes due-subscription gauges without allowing metrics work to fail billing. */
    private async refreshDueMetrics(
        cutoffDate: string,
        now: Date,
    ): Promise<void> {
        try {
            const counts = await this.repository.countDueSubscriptions(
                cutoffDate,
                now,
            );
            this.metrics.recordDueCounts(counts);
        } catch {
            return;
        }
    }
}

/** Returns a non-negative elapsed duration in milliseconds. */
function elapsedMs(startedAt: Date, completedAt: Date): number {
    return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

/** Validates the decoded cursor shape used by scheduler run listing. */
function isSchedulerRunListCursor(
    payload: Record<string, unknown>,
): payload is SchedulerRunListCursor {
    return (
        typeof payload.triggeredAt === 'string' &&
        isISO8601(payload.triggeredAt, { strict: true }) &&
        typeof payload.id === 'string' &&
        isUUID(payload.id) &&
        Object.keys(payload).length === 2
    );
}

/** Validates the decoded cursor shape used by scheduler run-item listing. */
function isSchedulerRunItemListCursor(
    payload: Record<string, unknown>,
): payload is SchedulerRunItemListCursor {
    return (
        typeof payload.startedAt === 'string' &&
        isISO8601(payload.startedAt, { strict: true }) &&
        typeof payload.id === 'string' &&
        isUUID(payload.id) &&
        Object.keys(payload).length === 2
    );
}
