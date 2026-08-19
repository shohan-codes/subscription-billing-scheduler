import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DATABASE, type DatabaseClient } from '../src/database/database.module';
import { BILLING_SCHEDULER_JOB_NAME } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { BillingSchedulerRepository } from '../src/modules/billing-scheduler/billing-scheduler.repository';
import { InvoicesRepository } from '../src/modules/invoices/invoices.repository';

const CUSTOMER_REFERENCE = `PROCESSING-CLAIM-${randomUUID()}`;

describe('Subscription processing claims (e2e)', () => {
    let app: INestApplication;
    let database: DatabaseClient;
    let repository: BillingSchedulerRepository;
    let invoicesRepository: InvoicesRepository;
    const runIds: string[] = [];

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        database = app.get<DatabaseClient>(DATABASE);
        repository = app.get(BillingSchedulerRepository);
        invoicesRepository = app.get(InvoicesRepository);
    });

    afterAll(async () => {
        await database
            .deleteFrom('subscriptions')
            .where('customer_reference', '=', CUSTOMER_REFERENCE)
            .execute();
        if (runIds.length > 0) {
            await database
                .deleteFrom('scheduler_runs')
                .where('id', 'in', runIds)
                .execute();
        }
        await app.close();
    });

    it('persists one atomic claim and excludes it from competing workers', async () => {
        const runId = await createRun(database, runIds);
        const competingRunId = await createRun(database, runIds);
        const subscriptionId = randomUUID();
        const now = new Date('2026-08-18T12:00:00.000Z');
        await database
            .insertInto('subscriptions')
            .values(subscription(subscriptionId))
            .execute();

        const first = await repository.claimDueBatch({
            cutoffDate: '2026-08-18',
            now,
            limit: 10,
            runId,
            owner: 'owner-a',
            claimStartedAt: now,
            claimExpiresAt: new Date('2026-08-18T12:05:00.000Z'),
        });
        const second = await repository.claimDueBatch({
            cutoffDate: '2026-08-18',
            now,
            limit: 10,
            runId: competingRunId,
            owner: 'owner-b',
            claimStartedAt: now,
            claimExpiresAt: new Date('2026-08-18T12:05:00.000Z'),
        });

        expect(first).toHaveLength(1);
        expect(first[0]).toMatchObject({
            id: subscriptionId,
            processing_run_id: runId,
            processing_owner: 'owner-a',
        });
        expect(second).toEqual([]);
    });

    it('reclaims an expired claim without allowing the old owner to clear it', async () => {
        const oldRunId = await createRun(database, runIds);
        const newRunId = await createRun(database, runIds);
        const subscriptionId = randomUUID();
        const now = new Date('2026-08-18T12:00:00.000Z');
        await database
            .insertInto('subscriptions')
            .values({
                ...subscription(subscriptionId),
                processing_run_id: oldRunId,
                processing_owner: 'old-owner',
                processing_started_at: new Date('2026-08-18T11:00:00.000Z'),
                processing_expires_at: new Date('2026-08-18T11:05:00.000Z'),
            })
            .execute();

        const claimed = await repository.claimDueBatch({
            cutoffDate: '2026-08-18',
            now,
            limit: 10,
            runId: newRunId,
            owner: 'new-owner',
            claimStartedAt: now,
            claimExpiresAt: new Date('2026-08-18T12:05:00.000Z'),
        });
        const clearedByOldOwner = await invoicesRepository.withTransaction(
            (transaction) =>
                transaction.clearClaim(subscriptionId, oldRunId, 'old-owner'),
        );
        const persisted = await database
            .selectFrom('subscriptions')
            .select(['processing_run_id', 'processing_owner'])
            .where('id', '=', subscriptionId)
            .executeTakeFirstOrThrow();

        expect(claimed[0]).toMatchObject({
            id: subscriptionId,
            processing_run_id: newRunId,
            processing_owner: 'new-owner',
        });
        expect(clearedByOldOwner).toBeUndefined();
        expect(persisted).toEqual({
            processing_run_id: newRunId,
            processing_owner: 'new-owner',
        });
    });
});

/** Creates a running scheduler record that can own subscription claims. */
async function createRun(
    database: DatabaseClient,
    runIds: string[],
): Promise<string> {
    const id = randomUUID();
    const now = new Date('2026-08-18T12:00:00.000Z');
    await database
        .insertInto('scheduler_runs')
        .values({
            id,
            job_name: BILLING_SCHEDULER_JOB_NAME,
            trigger_type: 'manual',
            triggered_at: now,
            cutoff_date: '2026-08-18',
            status: 'running',
            instance_id: 'claim-test-instance',
            lease_owner_token: randomUUID(),
            started_at: now,
            last_heartbeat_at: now,
        })
        .execute();
    runIds.push(id);
    return id;
}

/** Builds one active due subscription for claim ownership tests. */
function subscription(id: string) {
    return {
        id,
        customer_reference: CUSTOMER_REFERENCE,
        description: 'Processing claim test',
        status: 'active' as const,
        billing_state: 'ready' as const,
        currency: 'USD',
        amount: '10.0000',
        start_date: '2026-01-01',
        next_billing_date: '2026-08-18',
        billing_anchor_day: 18,
        anchor_is_month_end: false,
    };
}
