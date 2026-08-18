import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isISO8601, isUUID } from 'class-validator';
import { AppLogger } from '../../common/app-logger';
import { Clock } from '../../common/clock';
import { CursorCodec } from '../../common/utils/cursor-codec';
import { AppConfigService } from '../../config/app-config.service';
import { BillingSchedulerAction } from './billing-scheduler.action';
import {
    BILLING_SCHEDULER_JOB_NAME,
    SchedulerRunStatus,
    SchedulerTriggerType,
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
export class BillingSchedulerService {
    constructor(
        private readonly config: AppConfigService,
        private readonly clock: Clock,
        private readonly action: BillingSchedulerAction,
        private readonly repository: BillingSchedulerRepository,
        private readonly heartbeat: BillingSchedulerHeartbeat,
        private readonly cursorCodec: CursorCodec,
        private readonly logger: AppLogger,
    ) {}

    /** Starts the scheduler coordinator path for a scheduled trigger. */
    async triggerScheduled(): Promise<void> {
        try {
            await this.coordinate(SchedulerTriggerType.Scheduled);
        } catch {
            this.logger.error('billing.trigger.failed', {
                errorCode: 'SCHEDULER_TRIGGER_FAILED',
            });
        }
    }

    /** Starts an operator-requested billing run through the same coordinator path. */
    async triggerManual(): Promise<TriggerBillingRunResponse> {
        const run = await this.coordinate(SchedulerTriggerType.Manual);
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

    /** Coordinates one scheduled or manual trigger around lease ownership and run history. */
    private async coordinate(
        triggerType: SchedulerTriggerType,
    ): Promise<SchedulerRunRecord> {
        const triggeredAt = this.clock.now();
        const cutoffDate = this.clock.dateInTimeZone(
            this.config.billing.timezone,
            triggeredAt,
        );
        const leaseRequest = this.action.createLeaseRequest(
            triggeredAt,
            this.config.app.instanceId,
            this.config.billing.leaseSeconds,
        );
        const lease = await this.repository.acquireLease(leaseRequest);

        if (!lease) {
            const completedAt = this.clock.now();
            const skipped = await this.repository.createRunOrThrow({
                id: randomUUID(),
                job_name: BILLING_SCHEDULER_JOB_NAME,
                trigger_type: triggerType,
                triggered_at: triggeredAt,
                cutoff_date: cutoffDate,
                status: SchedulerRunStatus.SkippedLockUnavailable,
                instance_id: this.config.app.instanceId,
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
                error_code: 'SCHEDULER_LEASE_UNAVAILABLE',
                error_message:
                    'Another coordinator owns the active scheduler lease',
            });
            this.logger.info('billing.run.skipped', {
                runId: skipped.id,
                jobName: leaseRequest.lockName,
                result: SchedulerRunStatus.SkippedLockUnavailable,
            });
            return skipped;
        }

        const run = await this.repository.createRunOrThrow({
            id: randomUUID(),
            job_name: BILLING_SCHEDULER_JOB_NAME,
            trigger_type: triggerType,
            triggered_at: triggeredAt,
            cutoff_date: cutoffDate,
            status: SchedulerRunStatus.Running,
            instance_id: this.config.app.instanceId,
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
        this.heartbeat.start({
            lockName: lease.lock_name,
            ownerToken: lease.owner_token,
            runId: run.id,
        });
        this.logger.info('billing.run.started', {
            runId: run.id,
            triggerType,
        });

        try {
            if (this.heartbeat.isLeaseLost) {
                return this.repository.finalizeRunOrThrow(
                    run.id,
                    lease.owner_token,
                    {
                        status: SchedulerRunStatus.Interrupted,
                        completedAt: this.clock.now(),
                        counters: EMPTY_COUNTERS,
                        errorCode: 'SCHEDULER_LEASE_LOST',
                        errorMessage: 'Scheduler lease ownership was lost',
                    },
                );
            }

            return await this.repository.finalizeRunOrThrow(
                run.id,
                lease.owner_token,
                {
                    status: this.action.resolveCompletedStatus(EMPTY_COUNTERS),
                    completedAt: this.clock.now(),
                    counters: EMPTY_COUNTERS,
                },
            );
        } catch (error) {
            const failure = this.action.resolveSafeRunFailure(error);
            const failed = await this.repository.finalizeRun(
                run.id,
                lease.owner_token,
                {
                    status: SchedulerRunStatus.Failed,
                    completedAt: this.clock.now(),
                    counters: EMPTY_COUNTERS,
                    errorCode: failure.code,
                    errorMessage: failure.message,
                },
            );
            this.logger.error('billing.run.failed', {
                runId: run.id,
                errorCode: failure.code,
            });

            if (failed) return failed;
            throw error;
        } finally {
            this.heartbeat.stop();
            const released = await this.repository.releaseLease(
                lease.lock_name,
                lease.owner_token,
            );
            this.logger.info('billing.lease.released', {
                runId: run.id,
                jobName: lease.lock_name,
                released,
            });
        }
    }
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
