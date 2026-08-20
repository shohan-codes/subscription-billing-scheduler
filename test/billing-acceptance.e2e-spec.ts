import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { AppConfigService } from '../src/config/app-config.service';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';
import { $billingScheduler } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { $subscription } from '../src/modules/subscriptions/subscriptions.constant';

const OPERATOR_TOKEN = 'acceptance-test-token-1234567890';
const CUTOFF_DATE = '1900-01-31';

type RunResponseBody = {
    data: {
        id: string;
        status: string;
        eligibleCount: number;
        claimedCount: number;
        succeededCount: number;
        failedCount: number;
        skippedCount: number;
        invoicesCreatedCount: number;
    };
};

describe('Billing acceptance behavior (e2e)', () => {
    let app: INestApplication<Server>;
    let database: DatabaseClient;
    const subscriptionIds: string[] = [];
    const runIds: string[] = [];

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        Object.assign(moduleFixture.get(AppConfigService).operator, {
            ID: 'acceptance-operator',
            TOKEN: OPERATOR_TOKEN,
        });
        Object.assign(moduleFixture.get(AppConfigService).billing, {
            CRON_ENABLED: false,
            TIMEZONE: 'UTC',
        });
        jest.spyOn(moduleFixture.get(Clock), 'dateInTimeZone').mockReturnValue(
            CUTOFF_DATE,
        );

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                transform: true,
                whitelist: true,
                forbidNonWhitelisted: true,
            }),
        );
        app.setGlobalPrefix('api/v1');
        await app.init();
        database = app.get<DatabaseClient>($database.token.CLIENT);
    });

    afterAll(async () => {
        if (runIds.length > 0) {
            await database
                .deleteFrom('scheduler_run_items')
                .where('run_id', 'in', runIds)
                .execute();
        }
        if (subscriptionIds.length > 0) {
            const invoices = await database
                .selectFrom('invoices')
                .select('id')
                .where('subscription_id', 'in', subscriptionIds)
                .execute();
            const invoiceIds = invoices.map((invoice) => invoice.id);
            if (invoiceIds.length > 0) {
                await database
                    .deleteFrom('invoice_items')
                    .where('invoice_id', 'in', invoiceIds)
                    .execute();
                await database
                    .deleteFrom('invoices')
                    .where('id', 'in', invoiceIds)
                    .execute();
            }
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
        await database
            .deleteFrom('scheduler_locks')
            .where('lock_name', '=', $billingScheduler.job.NAME)
            .execute();
        await app.close();
    });

    it('processes only the due active subscription and keeps duplicate runs idempotent', async () => {
        const dueId = randomUUID();
        const futureId = randomUUID();
        const pausedId = randomUUID();
        const canceledId = randomUUID();
        subscriptionIds.push(dueId, futureId, pausedId, canceledId);

        await database
            .insertInto('subscriptions')
            .values([
                subscription(dueId, CUTOFF_DATE),
                subscription(futureId, '2099-01-31'),
                subscription(pausedId, CUTOFF_DATE, {
                    status: $subscription.status.PAUSED,
                }),
                subscription(canceledId, CUTOFF_DATE, {
                    status: $subscription.status.CANCELED,
                }),
            ])
            .execute();

        const firstResponse = await request(app.getHttpServer())
            .post('/api/v1/operations/billing-runs')
            .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
            .send({})
            .expect(202);
        const first = (firstResponse.body as RunResponseBody).data;
        runIds.push(first.id);

        expect(first).toMatchObject({
            status: 'completed',
            eligibleCount: 1,
            claimedCount: 1,
            succeededCount: 1,
            failedCount: 0,
            skippedCount: 0,
            invoicesCreatedCount: 1,
        });

        const invoice = await database
            .selectFrom('invoices')
            .selectAll()
            .where('subscription_id', '=', dueId)
            .executeTakeFirstOrThrow();
        expect(invoice.billing_period_start).toBe(CUTOFF_DATE);
        expect(invoice.generated_by_run_id).toBe(first.id);

        const due = await database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', dueId)
            .executeTakeFirstOrThrow();
        expect(due.next_billing_date).toBe('1900-02-28');

        for (const id of [futureId, pausedId, canceledId]) {
            const untouched = await database
                .selectFrom('subscriptions')
                .select(['next_billing_date', 'version'])
                .where('id', '=', id)
                .executeTakeFirstOrThrow();
            expect(untouched.version).toBe(1);
        }

        const secondResponse = await request(app.getHttpServer())
            .post('/api/v1/operations/billing-runs')
            .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
            .send({})
            .expect(202);
        const second = (secondResponse.body as RunResponseBody).data;
        runIds.push(second.id);
        expect(second.invoicesCreatedCount).toBe(0);

        const invoices = await database
            .selectFrom('invoices')
            .select('id')
            .where('subscription_id', '=', dueId)
            .execute();
        expect(invoices).toHaveLength(1);

        const persistedFirst = await database
            .selectFrom('scheduler_runs')
            .selectAll()
            .where('id', '=', first.id)
            .executeTakeFirstOrThrow();
        const items = await database
            .selectFrom('scheduler_run_items')
            .selectAll()
            .where('run_id', '=', first.id)
            .execute();
        expect(persistedFirst.succeeded_count).toBe(1);
        expect(persistedFirst.invoices_created_count).toBe(1);
        expect(items).toHaveLength(1);
        expect(items[0]?.invoices_created).toBe(1);

        await request(app.getHttpServer())
            .get(`/api/v1/operations/billing-runs/${first.id}`)
            .expect(200);
        await request(app.getHttpServer())
            .get(`/api/v1/operations/billing-runs/${first.id}/items`)
            .expect(200);
    });
});

type SubscriptionOverrides = Partial<{
    status: 'active' | 'paused' | 'canceled';
}>;

/** Builds a deterministic subscription fixture for acceptance scenarios. */
function subscription(
    id: string,
    nextBillingDate: string,
    overrides: SubscriptionOverrides = {},
) {
    return {
        id,
        customer_reference: `ACCEPTANCE-${id}`,
        description: 'Acceptance test subscription',
        status: overrides.status ?? $subscription.status.ACTIVE,
        billing_state: $subscription.billingState.READY,
        currency: 'USD',
        amount: '10.0000',
        start_date: CUTOFF_DATE,
        next_billing_date: nextBillingDate,
        billing_anchor_day: 31,
        anchor_is_month_end: false,
    };
}
