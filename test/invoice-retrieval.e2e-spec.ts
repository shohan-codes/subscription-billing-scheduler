import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { $billingScheduler } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { $invoice } from '../src/modules/invoices/invoices.constant';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';

type CreateSubscriptionBody = {
    data: {
        id: string;
        version: number;
    };
};

type InvoiceListBody = {
    data: {
        pagination: {
            nextCursor: string | null;
        };
    };
};

type InvoiceFixture = {
    id: string;
    invoiceNumber: string;
    runId: string | null;
};

/** Builds a valid subscription request for invoice retrieval scenarios. */
const createSubscriptionRequest = (
    customerReference: string,
    description = 'Pro Plan - Monthly',
) => ({
    customerReference,
    description,
    amount: '49.0000',
    currency: 'USD',
    startDate: '2026-08-16',
    firstBillingDate: '2026-08-31',
    billingAnchorDay: 31,
    anchorIsMonthEnd: true,
});

describe('Invoice persistence and read APIs (e2e)', () => {
    let app: INestApplication<Server>;
    let database: DatabaseClient;
    const subscriptionIds: string[] = [];
    const invoiceIds: string[] = [];
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

        database = app.get<DatabaseClient>($database.token.CLIENT);
    });

    afterAll(async () => {
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
        if (runIds.length > 0) {
            await database
                .deleteFrom('scheduler_runs')
                .where('id', 'in', runIds)
                .execute();
        }
        if (subscriptionIds.length > 0) {
            await database
                .deleteFrom('subscriptions')
                .where('id', 'in', subscriptionIds)
                .execute();
        }
        await app.close();
    });

    it('reads an invoice with snapshot fields, line items and scheduler run reference', async () => {
        const customerReference = `INV-GET-${randomUUID().slice(0, 8)}`;
        const subscription = await createSubscription(customerReference);
        const fixture = await createInvoiceFixture({
            subscriptionId: subscription.id,
            customerReference,
            billingPeriodStart: '2026-08-31',
            billingPeriodEnd: '2026-09-30',
            issueDate: '2026-08-31',
            description: 'Pro Plan - Monthly',
            withRun: true,
            withItem: true,
        });

        const response = await request(app.getHttpServer())
            .get(`/api/v1/invoices/${fixture.id}`)
            .expect(200);

        expect(response.body).toMatchObject({
            success: true,
            data: {
                id: fixture.id,
                invoiceNumber: fixture.invoiceNumber,
                subscriptionId: subscription.id,
                customerReference,
                billingPeriodStart: '2026-08-31',
                billingPeriodEnd: '2026-09-30',
                issueDate: '2026-08-31',
                status: 'issued',
                currency: 'USD',
                subtotal: '49.0000',
                taxTotal: '0.0000',
                discountTotal: '0.0000',
                total: '49.0000',
                generatedByRunId: fixture.runId,
                items: [
                    {
                        description: 'Pro Plan - Monthly',
                        quantity: '1.0000',
                        unitPrice: '49.0000',
                        lineTotal: '49.0000',
                    },
                ],
            },
            message: '',
            errors: [],
        });
    });

    it('returns not found for a missing invoice', async () => {
        const response = await request(app.getHttpServer())
            .get(`/api/v1/invoices/${randomUUID()}`)
            .expect(404);

        expect(response.body).toMatchObject({
            code: 'INVOICE_NOT_FOUND',
            message: 'Invoice was not found',
        });
    });

    it('lists invoices with filters and bounded cursor pagination', async () => {
        const customerReference = `INV-LIST-${randomUUID().slice(0, 8)}`;
        const subscription = await createSubscription(customerReference);
        const older = await createInvoiceFixture({
            subscriptionId: subscription.id,
            customerReference,
            billingPeriodStart: '2026-08-31',
            billingPeriodEnd: '2026-09-30',
            issueDate: '2026-08-31',
        });
        const newer = await createInvoiceFixture({
            subscriptionId: subscription.id,
            customerReference,
            billingPeriodStart: '2026-09-30',
            billingPeriodEnd: '2026-10-31',
            issueDate: '2026-09-30',
        });

        const firstPage = await request(app.getHttpServer())
            .get('/api/v1/invoices')
            .query({
                subscriptionId: subscription.id,
                customerReference,
                limit: 1,
            })
            .expect(200);

        expect(firstPage.body).toMatchObject({
            success: true,
            data: {
                items: [
                    {
                        id: newer.id,
                        subscriptionId: subscription.id,
                        customerReference,
                        billingPeriodStart: '2026-09-30',
                        billingPeriodEnd: '2026-10-31',
                        issueDate: '2026-09-30',
                    },
                ],
                pagination: { hasMore: true },
            },
        });
        const firstPageBody = firstPage.body as InvoiceListBody;
        expect(firstPageBody.data.pagination.nextCursor).toEqual(
            expect.any(String),
        );

        const secondPage = await request(app.getHttpServer())
            .get('/api/v1/invoices')
            .query({
                subscriptionId: subscription.id,
                customerReference,
                limit: 1,
                cursor: firstPageBody.data.pagination.nextCursor,
            })
            .expect(200);

        expect(secondPage.body).toMatchObject({
            success: true,
            data: {
                items: [
                    {
                        id: older.id,
                        billingPeriodStart: '2026-08-31',
                        billingPeriodEnd: '2026-09-30',
                        issueDate: '2026-08-31',
                    },
                ],
                pagination: {
                    nextCursor: null,
                    hasMore: false,
                },
            },
        });

        const periodFilter = await request(app.getHttpServer())
            .get('/api/v1/invoices')
            .query({
                subscriptionId: subscription.id,
                billingPeriodStart: '2026-08-31',
                billingPeriodEnd: '2026-09-30',
                issueDate: '2026-08-31',
            })
            .expect(200);

        expect(periodFilter.body).toMatchObject({
            data: {
                items: [{ id: older.id }],
                pagination: { hasMore: false },
            },
        });
    });

    it('keeps invoice snapshots unchanged after later subscription edits', async () => {
        const customerReference = `INV-SNAPSHOT-${randomUUID().slice(0, 8)}`;
        const subscription = await createSubscription(
            customerReference,
            'Original Plan',
        );
        const fixture = await createInvoiceFixture({
            subscriptionId: subscription.id,
            customerReference,
            billingPeriodStart: '2026-08-31',
            billingPeriodEnd: '2026-09-30',
            issueDate: '2026-08-31',
            description: 'Original Plan',
            withItem: true,
        });

        await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${subscription.id}`)
            .send({
                description: 'Changed Plan',
                amount: '99.0000',
                currency: 'EUR',
                version: subscription.version,
            })
            .expect(200);

        const response = await request(app.getHttpServer())
            .get(`/api/v1/invoices/${fixture.id}`)
            .expect(200);

        expect(response.body).toMatchObject({
            data: {
                customerReference,
                currency: 'USD',
                subtotal: '49.0000',
                total: '49.0000',
                items: [
                    {
                        description: 'Original Plan',
                        unitPrice: '49.0000',
                        lineTotal: '49.0000',
                    },
                ],
            },
        });
    });

    it('rejects invalid invoice filters and pagination input', async () => {
        await request(app.getHttpServer())
            .get('/api/v1/invoices')
            .query({ subscriptionId: 'not-a-uuid' })
            .expect(400);

        await request(app.getHttpServer())
            .get('/api/v1/invoices')
            .query({ billingPeriodStart: '2026-02-31' })
            .expect(400);

        await request(app.getHttpServer())
            .get('/api/v1/invoices')
            .query({ limit: 101 })
            .expect(400);

        const response = await request(app.getHttpServer())
            .get('/api/v1/invoices')
            .query({ cursor: 'not-a-valid-cursor' })
            .expect(400);

        expect(response.body).toMatchObject({ code: 'INVALID_CURSOR' });
    });

    /** Creates and tracks a subscription for the current invoice E2E scenario. */
    async function createSubscription(
        customerReference: string,
        description = 'Pro Plan - Monthly',
    ): Promise<{ id: string; version: number }> {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send(createSubscriptionRequest(customerReference, description))
            .expect(201);
        const body = response.body as CreateSubscriptionBody;

        subscriptionIds.push(body.data.id);
        return body.data;
    }

    /** Persists and tracks an invoice snapshot fixture for the current E2E scenario. */
    async function createInvoiceFixture({
        subscriptionId,
        customerReference,
        billingPeriodStart,
        billingPeriodEnd,
        issueDate,
        description = 'Pro Plan - Monthly',
        withRun = false,
        withItem = false,
    }: {
        subscriptionId: string;
        customerReference: string;
        billingPeriodStart: string;
        billingPeriodEnd: string;
        issueDate: string;
        description?: string;
        withRun?: boolean;
        withItem?: boolean;
    }): Promise<InvoiceFixture> {
        const id = randomUUID();
        const invoiceNumber = `INV-${id.slice(0, 8)}`;
        const runId = withRun ? await createSchedulerRun(issueDate) : null;

        await database
            .insertInto('invoices')
            .values({
                id,
                invoice_number: invoiceNumber,
                subscription_id: subscriptionId,
                customer_reference: customerReference,
                billing_period_start: billingPeriodStart,
                billing_period_end: billingPeriodEnd,
                issue_date: issueDate,
                status: $invoice.status.ISSUED,
                currency: 'USD',
                subtotal: '49.0000',
                tax_total: '0.0000',
                discount_total: '0.0000',
                total: '49.0000',
                idempotency_key: `invoice:${id}`,
                generated_by_run_id: runId,
            })
            .executeTakeFirstOrThrow();

        invoiceIds.push(id);

        if (withItem) {
            await database
                .insertInto('invoice_items')
                .values({
                    id: randomUUID(),
                    invoice_id: id,
                    description,
                    quantity: '1.0000',
                    unit_price: '49.0000',
                    line_total: '49.0000',
                })
                .executeTakeFirstOrThrow();
        }

        return { id, invoiceNumber, runId };
    }

    /** Persists and tracks a scheduler run referenced by an invoice fixture. */
    async function createSchedulerRun(cutoffDate: string): Promise<string> {
        const id = randomUUID();
        const timestamp = `${cutoffDate}T00:05:00.000Z`;

        await database
            .insertInto('scheduler_runs')
            .values({
                id,
                job_name: 'billing.invoice.scheduler',
                trigger_type: $billingScheduler.triggerType.MANUAL,
                triggered_at: timestamp,
                cutoff_date: cutoffDate,
                status: 'completed',
                instance_id: 'invoice-read-e2e',
                started_at: timestamp,
                completed_at: timestamp,
                last_heartbeat_at: timestamp,
            })
            .executeTakeFirstOrThrow();

        runIds.push(id);
        return id;
    }
});
