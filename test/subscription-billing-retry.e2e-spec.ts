import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/app-config.service';
import { DATABASE, type DatabaseClient } from '../src/database/database.module';

type SubscriptionBody = {
    data: {
        id: string;
        status: 'active' | 'paused' | 'canceled';
        billingState: 'ready' | 'retry_wait' | 'blocked';
        billingRetryAt: string | null;
        lastBillingErrorCode: string | null;
        version: number;
    };
};

const OPERATOR_TOKEN = 'test-operator-token-1234567890';

const createRequest = (customerReference: string) => ({
    customerReference,
    description: 'Billing Recovery Plan',
    amount: '49.0000',
    currency: 'USD',
    startDate: '2026-08-01',
    firstBillingDate: '2026-08-31',
    billingAnchorDay: 31,
    anchorIsMonthEnd: true,
});

describe('Subscription billing retry (e2e)', () => {
    let app: INestApplication<Server>;
    let database: DatabaseClient;
    const createdIds: string[] = [];
    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        Object.assign(
            moduleFixture.get(AppConfigService).operator.credentials,
            { 'operator-test': OPERATOR_TOKEN },
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

        database = app.get<DatabaseClient>(DATABASE);
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

    it('clears retry delay and returns the subscription to ready', async () => {
        const created = await createSubscription();
        await database
            .updateTable('subscriptions')
            .set({
                billing_state: 'retry_wait',
                billing_retry_at: '2099-08-18T03:05:00.000Z',
                billing_failure_count: 2,
                last_billing_error_code: 'DATABASE_DEADLOCK',
                last_billing_error_message: 'Temporary database conflict',
            })
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();

        const response = await authorizedRequest(created.id)
            .send({})
            .expect(202);
        const body = response.body as SubscriptionBody;

        expect(body.data).toMatchObject({
            id: created.id,
            billingState: 'ready',
            billingRetryAt: null,
            lastBillingErrorCode: 'DATABASE_DEADLOCK',
            version: created.version + 1,
        });
    });

    it('requires explicit unblock for blocked subscriptions', async () => {
        const created = await createSubscription();
        await database
            .updateTable('subscriptions')
            .set({
                billing_state: 'blocked',
                billing_failure_count: 1,
                last_billing_error_code: 'INVALID_BILLING_DATA',
            })
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();

        const rejected = await authorizedRequest(created.id)
            .send({})
            .expect(409);
        expect(rejected.body).toMatchObject({
            code: 'SUBSCRIPTION_UNBLOCK_REQUIRED',
        });

        const response = await authorizedRequest(created.id)
            .send({ unblock: true })
            .expect(202);
        const body = response.body as SubscriptionBody;

        expect(body.data).toMatchObject({
            id: created.id,
            billingState: 'ready',
            billingRetryAt: null,
            lastBillingErrorCode: 'INVALID_BILLING_DATA',
            version: created.version + 1,
        });
    });

    it('rejects requests outside the operator authorization boundary', async () => {
        const created = await createSubscription();

        await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${created.id}/billing-retry`)
            .send({})
            .expect(401);

        await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${created.id}/billing-retry`)
            .set('Authorization', 'Bearer wrong-token')
            .send({})
            .expect(401);
    });

    it('keeps canceled subscriptions terminal', async () => {
        const created = await createSubscription();
        await database
            .updateTable('subscriptions')
            .set({ status: 'canceled', billing_state: 'blocked' })
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();

        const response = await authorizedRequest(created.id)
            .send({ unblock: true })
            .expect(409);

        expect(response.body).toMatchObject({
            code: 'SUBSCRIPTION_BILLING_RECOVERY_CONFLICT',
        });
    });

    it('returns not found for an authorized request to a missing subscription', async () => {
        await authorizedRequest(randomUUID()).send({}).expect(404);
    });

    function authorizedRequest(id: string) {
        return request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${id}/billing-retry`)
            .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);
    }

    async function createSubscription(): Promise<SubscriptionBody['data']> {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send(
                createRequest(`RECOVERY-${randomUUID().slice(0, 8)}`),
            )
            .expect(201);
        const body = response.body as SubscriptionBody;

        createdIds.push(body.data.id);
        return body.data;
    }
});
