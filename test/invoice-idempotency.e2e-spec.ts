import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DATABASE, type DatabaseClient } from '../src/database/database.module';
import { InvoicesService } from '../src/modules/invoices/invoices.service';

type CreateSubscriptionBody = {
    data: {
        id: string;
    };
};

/** Builds the subscription request used by duplicate-confirmation scenarios. */
const createSubscriptionRequest = (customerReference: string) => ({
    customerReference,
    description: 'Pro Plan - Monthly',
    amount: '49.0000',
    currency: 'USD',
    startDate: '2026-01-01',
    firstBillingDate: '2026-01-31',
    billingAnchorDay: 31,
    anchorIsMonthEnd: false,
});

describe('Invoice idempotency and duplicate protection (e2e)', () => {
    let app: INestApplication<Server>;
    let database: DatabaseClient;
    let invoices: InvoicesService;
    const subscriptionIds: string[] = [];
    const runIds: string[] = [];

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

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

        database = app.get<DatabaseClient>(DATABASE);
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

    it('duplicate-confirms an existing obligation and advances without creating a second invoice', async () => {
        const customerReference = `IDEMP-${randomUUID().slice(0, 8)}`;
        const subscriptionId = await createSubscription(customerReference);
        const runId = await createSchedulerRun();
        const owner = `idempotency-e2e:${randomUUID()}`;
        const invoiceId = randomUUID();
        const idempotencyKey = `invoice:${subscriptionId}:2026-01-31:2026-02-28`;

        await database
            .updateTable('subscriptions')
            .set({
                processing_run_id: runId,
                processing_owner: owner,
                processing_started_at: '2026-01-31T00:05:00.000Z',
                processing_expires_at: '2099-01-31T00:10:00.000Z',
            })
            .where('id', '=', subscriptionId)
            .executeTakeFirstOrThrow();

        await database
            .insertInto('invoices')
            .values({
                id: invoiceId,
                invoice_number: `INV-${invoiceId.slice(0, 8)}`,
                subscription_id: subscriptionId,
                customer_reference: customerReference,
                billing_period_start: '2026-01-31',
                billing_period_end: '2026-02-28',
                issue_date: '2026-01-31',
                status: 'issued',
                currency: 'USD',
                subtotal: '49.0000',
                tax_total: '0.0000',
                discount_total: '0.0000',
                total: '49.0000',
                idempotency_key: idempotencyKey,
                generated_by_run_id: runId,
            })
            .executeTakeFirstOrThrow();
        await database
            .insertInto('invoice_items')
            .values({
                id: randomUUID(),
                invoice_id: invoiceId,
                description: 'Pro Plan - Monthly',
                quantity: '1.0000',
                unit_price: '49.0000',
                line_total: '49.0000',
            })
            .executeTakeFirstOrThrow();

        const result = await invoices.generateClaimed({
            subscriptionId,
            runId,
            owner,
            cutoffDate: '2026-01-31',
        });

        expect(result).toMatchObject({
            result: 'duplicate_confirmed',
            invoice: {
                id: invoiceId,
                idempotency_key: idempotencyKey,
            },
            nextBillingDate: '2026-02-28',
        });

        const invoiceCount = await database
            .selectFrom('invoices')
            .select((eb) => eb.fn.countAll<number>().as('count'))
            .where('subscription_id', '=', subscriptionId)
            .where('billing_period_start', '=', '2026-01-31')
            .where('billing_period_end', '=', '2026-02-28')
            .executeTakeFirstOrThrow();
        expect(Number(invoiceCount.count)).toBe(1);

        const itemCount = await database
            .selectFrom('invoice_items')
            .select((eb) => eb.fn.countAll<number>().as('count'))
            .where('invoice_id', '=', invoiceId)
            .executeTakeFirstOrThrow();
        expect(Number(itemCount.count)).toBe(1);

        const subscription = await database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', subscriptionId)
            .executeTakeFirstOrThrow();
        expect(subscription).toMatchObject({
            next_billing_date: '2026-02-28',
            processing_run_id: null,
            processing_owner: null,
            version: 2,
        });

        const runItem = await database
            .selectFrom('scheduler_run_items')
            .selectAll()
            .where('run_id', '=', runId)
            .where('subscription_id', '=', subscriptionId)
            .executeTakeFirstOrThrow();
        expect(runItem).toMatchObject({
            result: 'duplicate_confirmed',
            before_billing_date: '2026-01-31',
            after_billing_date: '2026-02-28',
            invoices_created: 0,
        });
    });

    /** Creates and tracks a subscription used by idempotency E2E scenarios. */
    async function createSubscription(
        customerReference: string,
    ): Promise<string> {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send(createSubscriptionRequest(customerReference))
            .expect(201);
        const body = response.body as CreateSubscriptionBody;

        subscriptionIds.push(body.data.id);
        return body.data.id;
    }

    /** Persists and tracks a running scheduler run for idempotency tests. */
    async function createSchedulerRun(): Promise<string> {
        const id = randomUUID();

        await database
            .insertInto('scheduler_runs')
            .values({
                id,
                job_name: 'billing.invoice.scheduler',
                trigger_type: 'manual',
                triggered_at: '2026-01-31T00:05:00.000Z',
                cutoff_date: '2026-01-31',
                status: 'running',
                instance_id: 'invoice-idempotency-e2e',
                lease_owner_token: `lease:${id}`,
                started_at: '2026-01-31T00:05:00.000Z',
                last_heartbeat_at: '2026-01-31T00:05:00.000Z',
            })
            .executeTakeFirstOrThrow();

        runIds.push(id);
        return id;
    }
});
