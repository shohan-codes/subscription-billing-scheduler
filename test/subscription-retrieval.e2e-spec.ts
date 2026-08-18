import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DATABASE, type DatabaseClient } from '../src/database/database.module';

type SubscriptionDetailsBody = {
    data: {
        createdAt: string;
        updatedAt: string;
    };
};

type SubscriptionListBody = {
    data: {
        pagination: {
            nextCursor: string | null;
        };
    };
};

type CreateSubscriptionBody = {
    data: {
        id: string;
    };
};

const createRequest = (
    customerReference: string,
    firstBillingDate = '2026-08-31',
    billingAnchorDay = 31,
) => ({
    customerReference,
    description: 'Pro Plan - Monthly',
    amount: '49.0000',
    currency: 'USD',
    startDate: '2026-08-16',
    firstBillingDate,
    billingAnchorDay,
    anchorIsMonthEnd: true,
});

describe('Subscription retrieval and listing (e2e)', () => {
    let app: INestApplication<Server>;
    let database: DatabaseClient;
    const createdIds: string[] = [];

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
    });

    afterAll(async () => {
        if (createdIds.length > 0) {
            await database
                .deleteFrom('invoices')
                .where('subscription_id', 'in', createdIds)
                .execute();
            await database
                .deleteFrom('subscriptions')
                .where('id', 'in', createdIds)
                .execute();
        }
        await app.close();
    });

    it('retrieves a subscription with failure state, schedule and latest invoice', async () => {
        const customerReference = `GET-${randomUUID().slice(0, 8)}`;
        const created = await createSubscription(customerReference);
        const olderInvoiceId = randomUUID();
        const latestInvoiceId = randomUUID();

        await database
            .updateTable('subscriptions')
            .set({
                billing_state: 'retry_wait',
                billing_failure_count: 2,
                billing_retry_at: '2026-09-01T08:00:00.000Z',
                last_billing_error_code: 'PAYMENT_TEMPORARY_FAILURE',
                last_billing_error_message: 'Temporary billing failure',
            })
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();

        await database
            .insertInto('invoices')
            .values([
                {
                    id: olderInvoiceId,
                    invoice_number: `INV-${olderInvoiceId.slice(0, 8)}`,
                    subscription_id: created.id,
                    customer_reference: customerReference,
                    billing_period_start: '2026-08-01',
                    billing_period_end: '2026-09-01',
                    issue_date: '2026-08-31',
                    status: 'issued',
                    currency: 'USD',
                    subtotal: '49.0000',
                    total: '49.0000',
                    idempotency_key: `invoice:${olderInvoiceId}`,
                },
                {
                    id: latestInvoiceId,
                    invoice_number: `INV-${latestInvoiceId.slice(0, 8)}`,
                    subscription_id: created.id,
                    customer_reference: customerReference,
                    billing_period_start: '2026-09-01',
                    billing_period_end: '2026-10-01',
                    issue_date: '2026-09-30',
                    status: 'issued',
                    currency: 'USD',
                    subtotal: '49.0000',
                    total: '49.0000',
                    idempotency_key: `invoice:${latestInvoiceId}`,
                },
            ])
            .execute();

        const response = await request(app.getHttpServer())
            .get(`/api/v1/subscriptions/${created.id}`)
            .expect(200);

        expect(response.body).toMatchObject({
            success: true,
            data: {
                id: created.id,
                customerReference,
                status: 'active',
                billingState: 'retry_wait',
                startDate: '2026-08-16',
                nextBillingDate: '2026-08-31',
                billingAnchorDay: 31,
                anchorIsMonthEnd: true,
                billingFailureCount: 2,
                billingRetryAt: '2026-09-01T08:00:00.000Z',
                lastBillingErrorCode: 'PAYMENT_TEMPORARY_FAILURE',
                lastBillingErrorMessage: 'Temporary billing failure',
                latestInvoice: {
                    id: latestInvoiceId,
                    invoiceNumber: `INV-${latestInvoiceId.slice(0, 8)}`,
                    billingPeriodStart: '2026-09-01',
                    billingPeriodEnd: '2026-10-01',
                    issueDate: '2026-09-30',
                    status: 'issued',
                    currency: 'USD',
                    total: '49.0000',
                },
            },
            message: '',
            errors: [],
        });

        const body = response.body as SubscriptionDetailsBody;
        expect(body.data.createdAt).toEqual(expect.any(String));
        expect(body.data.updatedAt).toEqual(expect.any(String));
    });

    it('returns not found for a missing subscription', async () => {
        const response = await request(app.getHttpServer())
            .get(`/api/v1/subscriptions/${randomUUID()}`)
            .expect(404);

        expect(response.body).toMatchObject({
            code: 'SUBSCRIPTION_NOT_FOUND',
            message: 'Subscription was not found',
        });
    });

    it('lists with filters and bounded cursor pagination', async () => {
        const customerReference = `LIST-${randomUUID().slice(0, 8)}`;
        const first = await createSubscription(
            customerReference,
            '2026-08-31',
            31,
        );
        const second = await createSubscription(
            customerReference,
            '2026-09-30',
            30,
        );
        await createSubscription(customerReference, '2026-10-31', 31);

        await database
            .updateTable('subscriptions')
            .set({ status: 'paused', billing_state: 'retry_wait' })
            .where('customer_reference', '=', customerReference)
            .execute();

        const firstPage = await request(app.getHttpServer())
            .get('/api/v1/subscriptions')
            .query({
                status: 'paused',
                billingState: 'retry_wait',
                customerReference,
                dueBefore: '2026-09-30',
                limit: 1,
            })
            .expect(200);

        expect(firstPage.body).toMatchObject({
            success: true,
            data: {
                items: [
                    {
                        id: first.id,
                        customerReference,
                        status: 'paused',
                        billingState: 'retry_wait',
                        nextBillingDate: '2026-08-31',
                    },
                ],
                pagination: {
                    hasMore: true,
                },
            },
        });
        const firstPageBody = firstPage.body as SubscriptionListBody;
        expect(firstPageBody.data.pagination.nextCursor).toEqual(
            expect.any(String),
        );

        const secondPage = await request(app.getHttpServer())
            .get('/api/v1/subscriptions')
            .query({
                status: 'paused',
                billingState: 'retry_wait',
                customerReference,
                dueBefore: '2026-09-30',
                limit: 1,
                cursor: firstPageBody.data.pagination.nextCursor,
            })
            .expect(200);

        expect(secondPage.body).toMatchObject({
            success: true,
            data: {
                items: [
                    {
                        id: second.id,
                        customerReference,
                        nextBillingDate: '2026-09-30',
                    },
                ],
                pagination: {
                    nextCursor: null,
                    hasMore: false,
                },
            },
        });
    });

    it('rejects invalid pagination input', async () => {
        await request(app.getHttpServer())
            .get('/api/v1/subscriptions')
            .query({ limit: 101 })
            .expect(400);

        const response = await request(app.getHttpServer())
            .get('/api/v1/subscriptions')
            .query({ cursor: 'not-a-valid-cursor' })
            .expect(400);

        expect(response.body).toMatchObject({ code: 'INVALID_CURSOR' });
    });

    async function createSubscription(
        customerReference: string,
        firstBillingDate = '2026-08-31',
        billingAnchorDay = 31,
    ): Promise<{ id: string }> {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send(
                createRequest(
                    customerReference,
                    firstBillingDate,
                    billingAnchorDay,
                ),
            )
            .expect(201);
        const body = response.body as CreateSubscriptionBody;
        const { id } = body.data;

        createdIds.push(id);
        return { id };
    }
});
