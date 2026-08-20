import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';
import { $billingScheduler } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { BillingSchedulerRepository } from '../src/modules/billing-scheduler/billing-scheduler.repository';

const CUSTOMER_REFERENCE = `RECOVERY-${randomUUID()}`;

describe('Expired claim and abandoned run recovery (e2e)', () => {
    let app: INestApplication;
    let database: DatabaseClient;
    let repository: BillingSchedulerRepository;
    const runIds: string[] = [];
    const subscriptionIds: string[] = [];

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        database = app.get<DatabaseClient>($database.token.CLIENT);
        repository = app.get(BillingSchedulerRepository);
    });

    afterAll(async () => {
        if (runIds.length > 0) {
            await database
                .deleteFrom('scheduler_run_items')
                .where('run_id', 'in', runIds)
                .execute();
        }
        if (subscriptionIds.length > 0) {
            await database
                .deleteFrom('subscriptions')
                .where('id', 'in', subscriptionIds)
                .execute();
        }
        if (runIds.length > 0) {
            await database
                .deleteFrom('scheduler_runs')
                .where('id', 'in', runIds)
                .execute();
        }
        await app.close();
    });

    it('marks stale runs abandoned without rewriting existing run items', async () => {
        const staleRunId = await createRun(
            database,
            runIds,
            '2026-08-18T09:55:00.000Z',
        );
        const freshRunId = await createRun(
            database,
            runIds,
            '2026-08-18T10:01:30.000Z',
        );
        const subscriptionId = randomUUID();
        subscriptionIds.push(subscriptionId);
        await database
            .insertInto('subscriptions')
            .values(subscription(subscriptionId))
            .execute();
        const itemId = randomUUID();
        await database
            .insertInto('scheduler_run_items')
            .values({
                id: itemId,
                run_id: staleRunId,
                subscription_id: subscriptionId,
                result: 'failed',
                before_billing_date: '2026-08-18',
                after_billing_date: '2026-08-18',
                invoices_created: 0,
                error_type: 'transient',
                error_code: 'DATABASE_TRANSIENT_FAILURE',
                error_message: 'Temporary database failure',
                started_at: '2026-08-18T09:55:00.000Z',
                completed_at: '2026-08-18T09:55:01.000Z',
            })
            .execute();

        const abandoned = await repository.abandonStaleRuns(
            $billingScheduler.job.NAME,
            new Date('2026-08-18T10:00:00.000Z'),
            new Date('2026-08-18T10:02:00.000Z'),
        );
        const stale = await repository.findRunByIdOrThrow(staleRunId);
        const fresh = await repository.findRunByIdOrThrow(freshRunId);
        const item = await database
            .selectFrom('scheduler_run_items')
            .selectAll()
            .where('id', '=', itemId)
            .executeTakeFirstOrThrow();

        expect(abandoned.map((run) => run.id)).toContain(staleRunId);
        expect(stale).toMatchObject({
            status: 'abandoned',
            error_code: 'SCHEDULER_RUN_ABANDONED',
        });
        expect(fresh.status).toBe('running');
        expect(item).toMatchObject({
            result: 'failed',
            error_code: 'DATABASE_TRANSIENT_FAILURE',
        });
    });
});

/** Creates one running scheduler attempt with a controlled heartbeat. */
async function createRun(
    database: DatabaseClient,
    runIds: string[],
    heartbeatAt: string,
): Promise<string> {
    const id = randomUUID();
    await database
        .insertInto('scheduler_runs')
        .values({
            id,
            job_name: $billingScheduler.job.NAME,
            trigger_type: $billingScheduler.triggerType.MANUAL,
            triggered_at: heartbeatAt,
            cutoff_date: '2026-08-18',
            status: $billingScheduler.runStatus.RUNNING,
            instance_id: 'recovery-test-instance',
            lease_owner_token: randomUUID(),
            started_at: heartbeatAt,
            last_heartbeat_at: heartbeatAt,
        })
        .execute();
    runIds.push(id);
    return id;
}

/** Builds the subscription referenced by preserved run-item history. */
function subscription(id: string) {
    return {
        id,
        customer_reference: CUSTOMER_REFERENCE,
        description: 'Recovery test subscription',
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
