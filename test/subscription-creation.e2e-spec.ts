import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';

/** Builds a valid request payload for subscription creation E2E tests. */
const createRequest = () => ({
    customerReference: 'CUST-E2E-1001',
    description: 'Pro Plan - Monthly',
    amount: '49.0000',
    currency: 'USD',
    startDate: '2026-08-16',
    firstBillingDate: '2026-08-31',
    billingAnchorDay: 31,
    anchorIsMonthEnd: true,
});

describe('Subscription creation (e2e)', () => {
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

        database = app.get<DatabaseClient>($database.token.CLIENT);
    });

    afterAll(async () => {
        if (createdIds.length > 0) {
            await database
                .deleteFrom('subscriptions')
                .where('id', 'in', createdIds)
                .execute();
        }
        await app.close();
    });

    it('creates a ready subscription with exact monetary storage', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send(createRequest())
            .expect(201);

        const body = response.body as {
            data: { id: string };
        } & Record<string, unknown>;

        expect(body).toMatchObject({
            success: true,
            data: {
                customerReference: 'CUST-E2E-1001',
                description: 'Pro Plan - Monthly',
                amount: '49.0000',
                currency: 'USD',
                startDate: '2026-08-16',
                nextBillingDate: '2026-08-31',
                billingAnchorDay: 31,
                anchorIsMonthEnd: true,
                status: 'active',
                billingState: 'ready',
                billingFailureCount: 0,
                version: 1,
            },
            message: '',
            errors: [],
        });

        const id = body.data.id;
        createdIds.push(id);

        const stored = await database
            .selectFrom('subscriptions')
            .select(['amount', 'status', 'billing_state', 'next_billing_date'])
            .where('id', '=', id)
            .executeTakeFirstOrThrow();

        expect(stored).toEqual({
            amount: '49.0000',
            status: 'active',
            billing_state: 'ready',
            next_billing_date: '2026-08-31',
        });
    });

    it.each([
        ['non-positive amount', { amount: '0.0000' }],
        ['malformed currency', { currency: 'usd' }],
    ] as const)('rejects %s at the request boundary', async (_name, values) => {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send({ ...createRequest(), ...values })
            .expect(400);

        expect(response.body).toMatchObject({
            code: 'BAD_REQUEST',
            message: 'Validation failed',
        });
    });

    it('rejects invalid date ordering', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send({
                ...createRequest(),
                firstBillingDate: '2026-08-15',
                anchorIsMonthEnd: false,
            })
            .expect(422);

        expect(response.body).toMatchObject({
            code: 'INVALID_SUBSCRIPTION_DATES',
        });
    });

    it('rejects inconsistent month-end settings', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send({
                ...createRequest(),
                firstBillingDate: '2026-08-30',
                billingAnchorDay: 30,
            })
            .expect(422);

        expect(response.body).toMatchObject({
            code: 'INVALID_BILLING_ANCHOR',
        });
    });
});
