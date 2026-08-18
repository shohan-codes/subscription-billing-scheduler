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

type ClaimedFixture = {
    subscriptionId: string;
    runId: string;
    owner: string;
};

/** Builds a valid anchored subscription request for invoice generation tests. */
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

describe('Transactional invoice generation (e2e)', () => {
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

    it('commits invoice, line item, schedule advancement, failure reset, audit and claim release together', async () => {
        const fixture = await createClaimedFixture();

        const result = await invoices.generateClaimed({
            subscriptionId: fixture.subscriptionId,
            runId: fixture.runId,
            owner: fixture.owner,
            cutoffDate: '2026-01-31',
        });

        expect(result.result).toBe('created');
        expect(result.nextBillingDate).toBe('2026-02-28');
        expect(result.invoice).toMatchObject({
            subscription_id: fixture.subscriptionId,
            billing_period_start: '2026-01-31',
            billing_period_end: '2026-02-28',
            issue_date: '2026-01-31',
            currency: 'USD',
            subtotal: '49.0000',
            tax_total: '0.0000',
            discount_total: '0.0000',
            total: '49.0000',
            generated_by_run_id: fixture.runId,
        });

        const item = await database
            .selectFrom('invoice_items')
            .selectAll()
            .where('invoice_id', '=', result.invoice.id)
            .executeTakeFirstOrThrow();
        expect(item).toMatchObject({
            description: 'Pro Plan - Monthly',
            quantity: '1.0000',
            unit_price: '49.0000',
            line_total: '49.0000',
        });

        const subscription = await database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', fixture.subscriptionId)
            .executeTakeFirstOrThrow();
        expect(subscription).toMatchObject({
            next_billing_date: '2026-02-28',
            billing_state: 'ready',
            billing_failure_count: 0,
            billing_retry_at: null,
            last_billing_error_code: null,
            last_billing_error_message: null,
            processing_run_id: null,
            processing_owner: null,
            processing_started_at: null,
            processing_expires_at: null,
            version: 2,
        });

        const runItem = await database
            .selectFrom('scheduler_run_items')
            .selectAll()
            .where('run_id', '=', fixture.runId)
            .where('subscription_id', '=', fixture.subscriptionId)
            .executeTakeFirstOrThrow();
        expect(runItem).toMatchObject({
            result: 'success',
            before_billing_date: '2026-01-31',
            after_billing_date: '2026-02-28',
            invoices_created: 1,
            error_type: null,
            error_code: null,
            error_message: null,
        });
    });

    it('rolls back schedule and claim changes when invoice persistence fails', async () => {
        const fixture = await createClaimedFixture();
        const existingInvoiceId = randomUUID();

        await database
            .insertInto('invoices')
            .values({
                id: existingInvoiceId,
                invoice_number: `INV-${existingInvoiceId.slice(0, 8)}`,
                subscription_id: fixture.subscriptionId,
                customer_reference: 'TXN-E2E',
                billing_period_start: '2026-01-31',
                billing_period_end: '2026-02-28',
                issue_date: '2026-01-31',
                status: 'issued',
                currency: 'USD',
                subtotal: '49.0000',
                tax_total: '0.0000',
                discount_total: '0.0000',
                total: '49.0000',
                idempotency_key: `existing:${existingInvoiceId}`,
                generated_by_run_id: fixture.runId,
            })
            .executeTakeFirstOrThrow();

        await expect(
            invoices.generateClaimed({
                subscriptionId: fixture.subscriptionId,
                runId: fixture.runId,
                owner: fixture.owner,
                cutoffDate: '2026-01-31',
            }),
        ).rejects.toBeDefined();

        const subscription = await database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', fixture.subscriptionId)
            .executeTakeFirstOrThrow();
        expect(subscription).toMatchObject({
            next_billing_date: '2026-01-31',
            billing_state: 'retry_wait',
            billing_failure_count: 2,
            processing_run_id: fixture.runId,
            processing_owner: fixture.owner,
            version: 1,
        });

        const invoiceCount = await database
            .selectFrom('invoices')
            .select((eb) => eb.fn.countAll<number>().as('count'))
            .where('subscription_id', '=', fixture.subscriptionId)
            .executeTakeFirstOrThrow();
        expect(Number(invoiceCount.count)).toBe(1);

        const runItems = await database
            .selectFrom('scheduler_run_items')
            .select('id')
            .where('run_id', '=', fixture.runId)
            .where('subscription_id', '=', fixture.subscriptionId)
            .execute();
        expect(runItems).toHaveLength(0);
    });

    /** Creates a subscription, scheduler run, and unexpired owned claim. */
    async function createClaimedFixture(): Promise<ClaimedFixture> {
        const customerReference = `TXN-${randomUUID().slice(0, 8)}`;
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send(createSubscriptionRequest(customerReference))
            .expect(201);
        const body = response.body as CreateSubscriptionBody;
        const subscriptionId = body.data.id;
        const runId = await createSchedulerRun();
        const owner = `invoice-e2e:${randomUUID()}`;

        subscriptionIds.push(subscriptionId);

        await database
            .updateTable('subscriptions')
            .set({
                billing_state: 'retry_wait',
                billing_failure_count: 2,
                billing_retry_at: '2026-01-30T00:00:00.000Z',
                last_billing_error_code: 'DATABASE_TIMEOUT',
                last_billing_error_message: 'Temporary database timeout',
                processing_run_id: runId,
                processing_owner: owner,
                processing_started_at: '2026-01-31T00:05:00.000Z',
                processing_expires_at: '2099-01-31T00:10:00.000Z',
            })
            .where('id', '=', subscriptionId)
            .executeTakeFirstOrThrow();

        return { subscriptionId, runId, owner };
    }

    /** Persists a running scheduler run used to own an invoice-processing claim. */
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
                instance_id: 'invoice-generation-e2e',
                lease_owner_token: `lease:${id}`,
                started_at: '2026-01-31T00:05:00.000Z',
                last_heartbeat_at: '2026-01-31T00:05:00.000Z',
            })
            .executeTakeFirstOrThrow();

        runIds.push(id);
        return id;
    }
});
