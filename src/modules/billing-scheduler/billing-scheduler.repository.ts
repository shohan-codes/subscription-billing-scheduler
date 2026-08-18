import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type DatabaseClient } from '../../database/database.module';
import type {
    SchedulerLeaseRecord,
    SchedulerLeaseRequest,
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
}
