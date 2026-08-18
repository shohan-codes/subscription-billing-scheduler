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
