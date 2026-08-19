import { $billingScheduler } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { $subscription } from '../src/modules/subscriptions/subscriptions.constant';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';
import { InvoicesService } from '../src/modules/invoices/invoices.service';

const CUSTOMER_REFERENCE = `CATCH-UP-${randomUUID()}`;

describe('Catch-up billing and per-subscription safety limits (e2e)', () => {
    let app: INestApplication;
    let database: DatabaseClient;
    let invoices: InvoicesService;
    const subscriptionIds: string[] = [];
    const runIds: string[] = [];

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        database = app.get<DatabaseClient>($database.token.CLIENT);
        invoices = app.get(InvoicesService);
    });

    afterAll(async () => {
        if (subscriptionIds.length > 0) {
            const invoiceRows = await database
                .selectFrom('invoices')
                .select('id')
                .where('subscription_id', 'in', subscriptionIds)
                .execute();
            const invoiceIds = invoiceRows.map((row) => row.id);
            if (invoiceIds.length > 0) {
                await database
                    .deleteFrom('invoice_items')
                    .where('invoice_id', 'in', invoiceIds)
                    .execute();
            }
            await database
                .deleteFrom('scheduler_run_items')
                .where('subscription_id', 'in', subscriptionIds)
                .execute();
            await database
                .deleteFrom('invoices')
                .where('subscription_id', 'in', subscriptionIds)
                .execute();
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

    it('generates three missed periods oldest-first and advances beyond cutoff', async () => {
        const fixture = await createClaimedFixture();

        const result = await invoices.generateClaimedCatchUp({
            ...fixture,
            cutoffDate: '2026-07-31',
            maxPeriods: 12,
        });
        const periods = await database
            .selectFrom('invoices')
            .select(['billing_period_start', 'billing_period_end'])
            .where('subscription_id', '=', fixture.subscriptionId)
            .orderBy('billing_period_start', 'asc')
            .execute();

        expect(periods).toEqual([
            {
                billing_period_start: '2026-05-31',
                billing_period_end: '2026-06-30',
            },
            {
                billing_period_start: '2026-06-30',
                billing_period_end: '2026-07-31',
            },
            {
                billing_period_start: '2026-07-31',
                billing_period_end: '2026-08-31',
            },
        ]);
        expect(result).toMatchObject({
            periodsProcessed: 3,
            invoicesCreated: 3,
            nextBillingDate: '2026-08-31',
            limitReached: false,
        });
    });

    it('stops at the catch-up limit and leaves the subscription ready and due', async () => {
        const fixture = await createClaimedFixture();

        const result = await invoices.generateClaimedCatchUp({
            ...fixture,
            cutoffDate: '2026-07-31',
            maxPeriods: 2,
        });
        const subscription = await database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', fixture.subscriptionId)
            .executeTakeFirstOrThrow();

        expect(result).toMatchObject({
            periodsProcessed: 2,
            invoicesCreated: 2,
            nextBillingDate: '2026-07-31',
            limitReached: true,
        });
        expect(subscription).toMatchObject({
            next_billing_date: '2026-07-31',
            billing_state: 'ready',
            processing_run_id: null,
            processing_owner: null,
        });
    });

    /** Creates one overdue month-end subscription with a valid processing claim. */
    async function createClaimedFixture(): Promise<{
        subscriptionId: string;
        runId: string;
        owner: string;
    }> {
        const subscriptionId = randomUUID();
        const runId = randomUUID();
        const owner = `catch-up:${randomUUID()}`;
        const now = new Date();
        subscriptionIds.push(subscriptionId);
        runIds.push(runId);

        await database
            .insertInto('scheduler_runs')
            .values({
                id: runId,
                job_name: 'billing.invoice.scheduler',
                trigger_type: $billingScheduler.triggerType.MANUAL,
                triggered_at: now,
                cutoff_date: '2026-07-31',
                status: $billingScheduler.runStatus.RUNNING,
                instance_id: 'catch-up-e2e',
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
                description: 'Catch-up monthly plan',
                status: $subscription.status.ACTIVE,
                billing_state: $subscription.billingState.READY,
                currency: 'USD',
                amount: '25.0000',
                start_date: '2026-01-31',
                next_billing_date: '2026-05-31',
                billing_anchor_day: 31,
                anchor_is_month_end: true,
                processing_run_id: runId,
                processing_owner: owner,
                processing_started_at: now,
                processing_expires_at: '2099-01-01T00:00:00.000Z',
            })
            .execute();

        return { subscriptionId, runId, owner };
    }
});
