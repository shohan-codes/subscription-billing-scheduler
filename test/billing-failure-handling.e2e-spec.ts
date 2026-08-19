import { $subscription } from '../src/modules/subscriptions/subscriptions.constant';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';
import { BillingSchedulerAction } from '../src/modules/billing-scheduler/billing-scheduler.action';
import { $billingScheduler } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { BillingSchedulerRepository } from '../src/modules/billing-scheduler/billing-scheduler.repository';

const CUSTOMER_REFERENCE = `FAILURE-HANDLING-${randomUUID()}`;

describe('Billing failure handling (e2e)', () => {
    let app: INestApplication;
    let database: DatabaseClient;
    let action: BillingSchedulerAction;
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
        action = app.get(BillingSchedulerAction);
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

    it('persists transient retry backoff and clears only the owned claim', async () => {
        const fixture = await createClaimedFixture();
        const completedAt = new Date('2026-08-18T12:00:00.000Z');
        const failure = action.classifyItemFailure(
            { code: '40P01', detail: 'secret database detail' },
            0,
            completedAt,
        );

        const item = await repository.recordItemFailure({
            subscriptionId: fixture.subscriptionId,
            runId: fixture.runId,
            owner: fixture.owner,
            beforeBillingDate: '2026-08-18',
            startedAt: new Date('2026-08-18T11:59:59.000Z'),
            completedAt,
            failure,
        });
        const subscription = await database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', fixture.subscriptionId)
            .executeTakeFirstOrThrow();

        expect(item).toMatchObject({
            result: 'failed',
            error_type: 'transient',
            error_code: 'DATABASE_TRANSIENT_FAILURE',
            error_message:
                'A temporary database error interrupted subscription billing',
        });
        expect(subscription).toMatchObject({
            billing_state: 'retry_wait',
            billing_failure_count: 1,
            last_billing_error_code: 'DATABASE_TRANSIENT_FAILURE',
            processing_run_id: null,
            processing_owner: null,
        });
        expect(subscription.billing_retry_at?.toISOString()).toBe(
            '2026-08-18T12:01:00.000Z',
        );
    });

    it('blocks permanent failures without persisting raw error details', async () => {
        const fixture = await createClaimedFixture(2);
        const completedAt = new Date('2026-08-18T12:00:00.000Z');
        const failure = action.classifyItemFailure(
            new Error('password=secret sql=select * from private_table'),
            2,
            completedAt,
        );

        const item = await repository.recordItemFailure({
            subscriptionId: fixture.subscriptionId,
            runId: fixture.runId,
            owner: fixture.owner,
            beforeBillingDate: '2026-08-18',
            startedAt: new Date('2026-08-18T11:59:59.000Z'),
            completedAt,
            failure,
        });
        const subscription = await database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', fixture.subscriptionId)
            .executeTakeFirstOrThrow();

        expect(item).toMatchObject({
            result: 'failed',
            error_type: 'permanent',
            error_code: 'BILLING_ITEM_FAILED',
            error_message:
                'Subscription billing failed because of an unrecoverable item error',
        });
        expect(item?.error_message).not.toContain('secret');
        expect(item?.error_message).not.toContain('select');
        expect(subscription).toMatchObject({
            billing_state: 'blocked',
            billing_failure_count: 2,
            billing_retry_at: null,
            last_billing_error_code: 'BILLING_ITEM_FAILED',
            processing_run_id: null,
            processing_owner: null,
        });
    });

    /** Creates one active due subscription with a valid processing claim. */
    async function createClaimedFixture(failureCount = 0): Promise<{
        subscriptionId: string;
        runId: string;
        owner: string;
    }> {
        const subscriptionId = randomUUID();
        const runId = randomUUID();
        const owner = `failure-e2e:${randomUUID()}`;
        const now = new Date('2026-08-18T11:59:00.000Z');
        subscriptionIds.push(subscriptionId);
        runIds.push(runId);

        await database
            .insertInto('scheduler_runs')
            .values({
                id: runId,
                job_name: $billingScheduler.job.NAME,
                trigger_type: $billingScheduler.triggerType.MANUAL,
                triggered_at: now,
                cutoff_date: '2026-08-18',
                status: $billingScheduler.runStatus.RUNNING,
                instance_id: 'failure-e2e-instance',
                lease_owner_token: randomUUID(),
                started_at: now,
                last_heartbeat_at: now,
            })
            .execute();
        await database
            .insertInto('subscriptions')
            .values({
                id: subscriptionId,
                customer_reference: CUSTOMER_REFERENCE,
                description: 'Failure handling subscription',
                status: $subscription.status.ACTIVE,
                billing_state: $subscription.billingState.READY,
                currency: 'USD',
                amount: '20.0000',
                start_date: '2026-01-01',
                next_billing_date: '2026-08-18',
                billing_anchor_day: 18,
                anchor_is_month_end: false,
                billing_failure_count: failureCount,
                processing_run_id: runId,
                processing_owner: owner,
                processing_started_at: now,
                processing_expires_at: new Date('2026-08-18T12:05:00.000Z'),
            })
            .execute();

        return { subscriptionId, runId, owner };
    }
});
