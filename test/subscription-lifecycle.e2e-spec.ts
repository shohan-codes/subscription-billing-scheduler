import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DATABASE, type DatabaseClient } from '../src/database/database.module';

type SubscriptionBody = {
    data: {
        id: string;
        status: 'active' | 'paused' | 'canceled';
        nextBillingDate: string;
        version: number;
    };
};

/** Builds a valid request payload for subscription lifecycle E2E tests. */
const createRequest = (customerReference: string) => ({
    customerReference,
    description: 'Lifecycle Plan',
    amount: '49.0000',
    currency: 'USD',
    startDate: '2026-08-01',
    firstBillingDate: '2026-08-31',
    billingAnchorDay: 31,
    anchorIsMonthEnd: true,
});

describe('Subscription lifecycle (e2e)', () => {
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
                .deleteFrom('subscriptions')
                .where('id', 'in', createdIds)
                .execute();
        }
        await app.close();
    });

    it('pauses an active subscription without changing its due date', async () => {
        const created = await createSubscription();

        const response = await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${created.id}/pause`)
            .expect(200);
        const body = response.body as SubscriptionBody;

        expect(body.data).toMatchObject({
            id: created.id,
            status: 'paused',
            nextBillingDate: created.nextBillingDate,
            version: created.version + 1,
        });
    });

    it('resumes a paused overdue subscription without advancing its due date', async () => {
        const created = await createSubscription({
            startDate: '2026-07-01',
            firstBillingDate: '2026-07-31',
        });

        await database
            .updateTable('subscriptions')
            .set({ status: 'paused' })
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();

        const response = await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${created.id}/resume`)
            .expect(200);
        const body = response.body as SubscriptionBody;

        expect(body.data).toMatchObject({
            id: created.id,
            status: 'active',
            nextBillingDate: '2026-07-31',
            version: created.version + 1,
        });
    });

    it('cancels active or paused subscriptions and keeps cancellation terminal', async () => {
        const active = await createSubscription();
        const paused = await createSubscription();

        await database
            .updateTable('subscriptions')
            .set({ status: 'paused' })
            .where('id', '=', paused.id)
            .executeTakeFirstOrThrow();

        await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${active.id}/cancel`)
            .expect(200);
        await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${paused.id}/cancel`)
            .expect(200);

        for (const action of ['pause', 'resume', 'cancel'] as const) {
            const response = await request(app.getHttpServer())
                .post(`/api/v1/subscriptions/${active.id}/${action}`)
                .expect(409);

            expect(response.body).toMatchObject({
                code: 'SUBSCRIPTION_STATE_CONFLICT',
            });
        }
    });

    it('rejects invalid non-terminal transitions', async () => {
        const active = await createSubscription();

        const resume = await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${active.id}/resume`)
            .expect(409);
        expect(resume.body).toMatchObject({
            code: 'SUBSCRIPTION_STATE_CONFLICT',
        });

        await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${active.id}/pause`)
            .expect(200);

        const pauseAgain = await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${active.id}/pause`)
            .expect(409);
        expect(pauseAgain.body).toMatchObject({
            code: 'SUBSCRIPTION_STATE_CONFLICT',
        });
    });

    it('returns not found for a missing subscription', async () => {
        await request(app.getHttpServer())
            .post(`/api/v1/subscriptions/${randomUUID()}/pause`)
            .expect(404);
    });

    /** Creates and tracks a subscription for the current E2E scenario. */
    async function createSubscription(
        overrides: Partial<ReturnType<typeof createRequest>> = {},
    ): Promise<SubscriptionBody['data']> {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send({
                ...createRequest(`LIFECYCLE-${randomUUID().slice(0, 8)}`),
                ...overrides,
            })
            .expect(201);
        const body = response.body as SubscriptionBody;

        createdIds.push(body.data.id);
        return body.data;
    }
});
