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
        description: string;
        amount: string;
        currency: string;
        nextBillingDate: string;
        billingAnchorDay: number;
        anchorIsMonthEnd: boolean;
        version: number;
    };
};

const createRequest = (customerReference: string) => ({
    customerReference,
    description: 'Pro Plan - Monthly',
    amount: '49.0000',
    currency: 'USD',
    startDate: '2026-08-16',
    firstBillingDate: '2026-08-31',
    billingAnchorDay: 31,
    anchorIsMonthEnd: true,
});

describe('Subscription update (e2e)', () => {
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

    it('updates allowed commercial and schedule fields', async () => {
        const created = await createSubscription();

        const response = await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${created.id}`)
            .send({
                description: 'Pro Plan - Annual',
                amount: '99.0000',
                currency: 'EUR',
                nextBillingDate: '2026-09-30',
                billingAnchorDay: 30,
                anchorIsMonthEnd: true,
                version: created.version,
            })
            .expect(200);

        expect(response.body).toMatchObject({
            success: true,
            data: {
                id: created.id,
                description: 'Pro Plan - Annual',
                amount: '99.0000',
                currency: 'EUR',
                nextBillingDate: '2026-09-30',
                billingAnchorDay: 30,
                anchorIsMonthEnd: true,
                version: created.version + 1,
            },
        });
    });

    it('rejects a stale version', async () => {
        const created = await createSubscription();

        await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${created.id}`)
            .send({ description: 'Updated once', version: created.version })
            .expect(200);

        const response = await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${created.id}`)
            .send({ amount: '59.0000', version: created.version })
            .expect(409);

        expect(response.body).toMatchObject({
            code: 'SUBSCRIPTION_VERSION_CONFLICT',
        });
    });

    it('rejects schedule changes while a processing claim is active', async () => {
        const created = await createSubscription();

        await database
            .updateTable('subscriptions')
            .set({
                processing_owner: 'scheduler-demo',
                processing_started_at: '2026-08-18T03:00:00.000Z',
                processing_expires_at: '2099-08-18T03:05:00.000Z',
            })
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();

        const blocked = await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${created.id}`)
            .send({
                nextBillingDate: '2026-09-30',
                billingAnchorDay: 30,
                version: created.version,
            })
            .expect(409);

        expect(blocked.body).toMatchObject({
            code: 'SUBSCRIPTION_PROCESSING_CLAIM_ACTIVE',
        });

        await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${created.id}`)
            .send({ description: 'Commercial edit', version: created.version })
            .expect(200);
    });

    it('rejects schedule changes for a canceled subscription', async () => {
        const created = await createSubscription();

        await database
            .updateTable('subscriptions')
            .set({ status: 'canceled' })
            .where('id', '=', created.id)
            .executeTakeFirstOrThrow();

        const response = await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${created.id}`)
            .send({
                nextBillingDate: '2026-09-30',
                billingAnchorDay: 30,
                version: created.version,
            })
            .expect(422);

        expect(response.body).toMatchObject({
            code: 'INVALID_SUBSCRIPTION_STATE',
        });
    });

    it('returns not found and rejects unsupported update fields', async () => {
        await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${randomUUID()}`)
            .send({ description: 'Missing', version: 1 })
            .expect(404);

        const created = await createSubscription();
        await request(app.getHttpServer())
            .patch(`/api/v1/subscriptions/${created.id}`)
            .send({ status: 'paused', version: created.version })
            .expect(400);
    });

    async function createSubscription(): Promise<{
        id: string;
        version: number;
    }> {
        const response = await request(app.getHttpServer())
            .post('/api/v1/subscriptions')
            .send(createRequest(`UPDATE-${randomUUID().slice(0, 8)}`))
            .expect(201);
        const body = response.body as SubscriptionBody;

        createdIds.push(body.data.id);
        return { id: body.data.id, version: body.data.version };
    }
});
