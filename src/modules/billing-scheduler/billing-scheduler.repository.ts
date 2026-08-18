import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type DatabaseClient } from '../../database/database.module';
import {
    SchedulerRunNotFoundException,
    SchedulerRunStateConflictException,
} from './billing-scheduler.errors';
import type {
    DueSubscriptionBatchQuery,
    DueSubscriptionRecord,
    SchedulerLeaseRecord,
    SchedulerLeaseRequest,
    SchedulerRunFinalization,
    SchedulerRunInsert,
    SchedulerRunItemListQuery,
    SchedulerRunItemRecord,
    SchedulerRunListQuery,
    SchedulerRunRecord,
    SubscriptionBatchClaimQuery,
} from './billing-scheduler.types';

@Injectable()
export class BillingSchedulerRepository {
    constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

    /** Acquires an absent or expired scheduler lease atomically. */
    acquireLease(
        request: SchedulerLeaseRequest,
    ): Promise<SchedulerLeaseRecord | undefined> {
        return this.database
            .insertInto('scheduler_locks')
            .values({
                lock_name: request.lockName,
                owner_token: request.ownerToken,
                acquired_at: request.acquiredAt,
                lease_expires_at: request.leaseExpiresAt,
                heartbeat_at: request.acquiredAt,
            })
            .onConflict((conflict) =>
                conflict
                    .column('lock_name')
                    .doUpdateSet({
                        owner_token: request.ownerToken,
                        acquired_at: request.acquiredAt,
                        lease_expires_at: request.leaseExpiresAt,
                        heartbeat_at: request.acquiredAt,
                        version: sql<number>`scheduler_locks.version + 1`,
                    })
                    .where(
                        sql<boolean>`scheduler_locks.lease_expires_at <= ${request.acquiredAt}`,
                    ),
            )
            .returningAll()
            .executeTakeFirst();
    }

    /** Renews an unexpired scheduler lease only for its current owner. */
    renewLease(
        lockName: string,
        ownerToken: string,
        heartbeatAt: Date,
        leaseExpiresAt: Date,
    ): Promise<SchedulerLeaseRecord | undefined> {
        return this.database
            .updateTable('scheduler_locks')
            .set({
                heartbeat_at: heartbeatAt,
                lease_expires_at: leaseExpiresAt,
                version: sql<number>`version + 1`,
            })
            .where('lock_name', '=', lockName)
            .where('owner_token', '=', ownerToken)
            .where('lease_expires_at', '>', heartbeatAt)
            .returningAll()
            .executeTakeFirst();
    }

    /** Updates run liveness only while the matching lease owner still owns the running record. */
    async updateRunHeartbeat(
        runId: string,
        ownerToken: string,
        heartbeatAt: Date,
    ): Promise<boolean> {
        const run = await this.database
            .updateTable('scheduler_runs')
            .set({ last_heartbeat_at: heartbeatAt })
            .where('id', '=', runId)
            .where('lease_owner_token', '=', ownerToken)
            .where('status', '=', 'running')
            .returning('id')
            .executeTakeFirst();

        return Boolean(run);
    }

    /** Releases a scheduler lease only while the caller still owns it. */
    async releaseLease(lockName: string, ownerToken: string): Promise<boolean> {
        const released = await this.database
            .deleteFrom('scheduler_locks')
            .where('lock_name', '=', lockName)
            .where('owner_token', '=', ownerToken)
            .returning('lock_name')
            .executeTakeFirst();

        return Boolean(released);
    }

    /** Creates a scheduler run attempt and returns the persisted record. */
    createRunOrThrow(run: SchedulerRunInsert): Promise<SchedulerRunRecord> {
        return this.database
            .insertInto('scheduler_runs')
            .values(run)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    /** Selects one deterministic due batch while skipping rows locked by competing workers. */
    findDueBatch(
        query: DueSubscriptionBatchQuery,
    ): Promise<DueSubscriptionRecord[]> {
        return this.database.transaction().execute((transaction) =>
            transaction
                .selectFrom('subscriptions')
                .selectAll()
                .where('status', '=', 'active')
                .where('billing_state', 'in', ['ready', 'retry_wait'])
                .where('next_billing_date', '<=', query.cutoffDate)
                .where((eb) =>
                    eb.or([
                        eb('billing_retry_at', 'is', null),
                        eb('billing_retry_at', '<=', query.now),
                    ]),
                )
                .orderBy('next_billing_date', 'asc')
                .orderBy('id', 'asc')
                .limit(query.limit)
                .forUpdate()
                .skipLocked()
                .execute(),
        );
    }

    /** Claims one deterministic due batch and persists processing ownership atomically. */
    claimDueBatch(
        query: SubscriptionBatchClaimQuery,
    ): Promise<DueSubscriptionRecord[]> {
        return this.database.transaction().execute(async (transaction) => {
            const candidates = await transaction
                .selectFrom('subscriptions')
                .selectAll()
                .where('status', '=', 'active')
                .where('billing_state', 'in', ['ready', 'retry_wait'])
                .where('next_billing_date', '<=', query.cutoffDate)
                .where((eb) =>
                    eb.or([
                        eb('billing_retry_at', 'is', null),
                        eb('billing_retry_at', '<=', query.now),
                    ]),
                )
                .where((eb) =>
                    eb.or([
                        eb('processing_run_id', 'is', null),
                        eb('processing_expires_at', 'is', null),
                        eb('processing_expires_at', '<=', query.now),
                    ]),
                )
                .where(({ exists, not, selectFrom }) =>
                    not(
                        exists(
                            selectFrom('scheduler_run_items')
                                .select('id')
                                .whereRef(
                                    'subscription_id',
                                    '=',
                                    'subscriptions.id',
                                )
                                .where('run_id', '=', query.runId),
                        ),
                    ),
                )
                .orderBy('next_billing_date', 'asc')
                .orderBy('id', 'asc')
                .limit(query.limit)
                .forUpdate()
                .skipLocked()
                .execute();

            if (candidates.length === 0) return [];

            const claimed = await transaction
                .updateTable('subscriptions')
                .set({
                    processing_run_id: query.runId,
                    processing_owner: query.owner,
                    processing_started_at: query.claimStartedAt,
                    processing_expires_at: query.claimExpiresAt,
                })
                .where(
                    'id',
                    'in',
                    candidates.map((candidate) => candidate.id),
                )
                .returningAll()
                .execute();
            const claimedById = new Map(
                claimed.map((subscription) => [subscription.id, subscription]),
            );

            return candidates.flatMap((candidate) => {
                const subscription = claimedById.get(candidate.id);
                return subscription ? [subscription] : [];
            });
        });
    }

    /** Finalizes a running scheduler record or throws when ownership changed. */
    async finalizeRunOrThrow(
        runId: string,
        ownerToken: string,
        finalization: SchedulerRunFinalization,
    ): Promise<SchedulerRunRecord> {
        const run = await this.finalizeRun(runId, ownerToken, finalization);

        if (!run) throw new SchedulerRunStateConflictException();
        return run;
    }

    /** Finalizes a running scheduler record only for its matching owner token. */
    finalizeRun(
        runId: string,
        ownerToken: string,
        finalization: SchedulerRunFinalization,
    ): Promise<SchedulerRunRecord | undefined> {
        return this.database
            .updateTable('scheduler_runs')
            .set({
                status: finalization.status,
                completed_at: finalization.completedAt,
                eligible_count: finalization.counters.eligibleCount,
                claimed_count: finalization.counters.claimedCount,
                succeeded_count: finalization.counters.succeededCount,
                failed_count: finalization.counters.failedCount,
                skipped_count: finalization.counters.skippedCount,
                invoices_created_count:
                    finalization.counters.invoicesCreatedCount,
                error_code: finalization.errorCode ?? null,
                error_message: finalization.errorMessage ?? null,
            })
            .where('id', '=', runId)
            .where('lease_owner_token', '=', ownerToken)
            .where('status', '=', 'running')
            .returningAll()
            .executeTakeFirst();
    }

    /** Finds a scheduler run by ID or throws when missing. */
    async findRunByIdOrThrow(id: string): Promise<SchedulerRunRecord> {
        const run = await this.findRunById(id);

        if (!run) throw new SchedulerRunNotFoundException();
        return run;
    }

    /** Finds a scheduler run by ID. */
    findRunById(id: string): Promise<SchedulerRunRecord | undefined> {
        return this.database
            .selectFrom('scheduler_runs')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst();
    }

    /** Lists scheduler runs using filters and deterministic cursor pagination. */
    listRuns(query: SchedulerRunListQuery): Promise<SchedulerRunRecord[]> {
        let statement = this.database.selectFrom('scheduler_runs').selectAll();

        if (query.triggerType) {
            statement = statement.where('trigger_type', '=', query.triggerType);
        }
        if (query.status) {
            statement = statement.where('status', '=', query.status);
        }
        if (query.cursor) {
            const triggeredAt = new Date(query.cursor.triggeredAt);
            statement = statement.where((eb) =>
                eb.or([
                    eb('triggered_at', '<', triggeredAt),
                    eb.and([
                        eb('triggered_at', '=', triggeredAt),
                        eb('id', '<', query.cursor!.id),
                    ]),
                ]),
            );
        }

        return statement
            .orderBy('triggered_at', 'desc')
            .orderBy('id', 'desc')
            .limit(query.limit + 1)
            .execute();
    }

    /** Lists scheduler run items using filters and deterministic cursor pagination. */
    listRunItems(
        query: SchedulerRunItemListQuery,
    ): Promise<SchedulerRunItemRecord[]> {
        let statement = this.database
            .selectFrom('scheduler_run_items')
            .selectAll()
            .where('run_id', '=', query.runId);

        if (query.result) {
            statement = statement.where('result', '=', query.result);
        }
        if (query.errorCode) {
            statement = statement.where('error_code', '=', query.errorCode);
        }
        if (query.cursor) {
            const startedAt = new Date(query.cursor.startedAt);
            statement = statement.where((eb) =>
                eb.or([
                    eb('started_at', '<', startedAt),
                    eb.and([
                        eb('started_at', '=', startedAt),
                        eb('id', '<', query.cursor!.id),
                    ]),
                ]),
            );
        }

        return statement
            .orderBy('started_at', 'desc')
            .orderBy('id', 'desc')
            .limit(query.limit + 1)
            .execute();
    }
}
