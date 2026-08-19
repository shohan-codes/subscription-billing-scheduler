import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/app-config.service';
import { ShutdownState } from '../src/common/shutdown-state';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';
import { $billingScheduler } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { BillingSchedulerRepository } from '../src/modules/billing-scheduler/billing-scheduler.repository';
import { BillingSchedulerService } from '../src/modules/billing-scheduler/billing-scheduler.service';

const OPERATOR_TOKEN = 'scheduler-test-token-1234567890';

type RunBody = {
    data: {
        id: string;
        triggerType: 'scheduled' | 'manual';
        status: string;
        cutoffDate: string;
        eligibleCount: number;
        claimedCount: number;
        succeededCount: number;
        failedCount: number;
        skippedCount: number;
        invoicesCreatedCount: number;
    };
};

describe('Scheduler run history and manual trigger (e2e)', () => {
    let app: INestApplication<Server>;
    let database: DatabaseClient;
    let scheduler: BillingSchedulerService;
    let repository: BillingSchedulerRepository;
    const runIds: string[] = [];

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        Object.assign(moduleFixture.get(AppConfigService).operator, {
            ID: 'operator-test',
            TOKEN: OPERATOR_TOKEN,
        });
        Object.assign(moduleFixture.get(AppConfigService).billing, {
            cronEnabled: false,
            timezone: 'UTC',
        });

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
        scheduler = app.get(BillingSchedulerService);
        repository = app.get(BillingSchedulerRepository);
    });

    afterAll(async () => {
        if (runIds.length > 0) {
            await database
                .deleteFrom('scheduler_run_items')
                .where('run_id', 'in', runIds)
                .execute();
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

    it('persists an operator-authorized manual attempt and exposes its history', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/v1/operations/billing-runs')
            .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
            .send({})
            .expect(202);
        const body = response.body as RunBody;
        runIds.push(body.data.id);

        expect(body.data).toMatchObject({
            triggerType: 'manual',
            status: 'completed',
            eligibleCount: 0,
            claimedCount: 0,
            succeededCount: 0,
            failedCount: 0,
            skippedCount: 0,
            invoicesCreatedCount: 0,
        });

        const detail = await request(app.getHttpServer())
            .get(`/api/v1/operations/billing-runs/${body.data.id}`)
            .expect(200);
        expect((detail.body as RunBody).data.id).toBe(body.data.id);

        const listed = await request(app.getHttpServer())
            .get('/api/v1/operations/billing-runs?triggerType=manual&limit=10')
            .expect(200);
        const listedBody = listed.body as {
            data: { items: Array<{ id: string }> };
        };
        expect(
            listedBody.data.items.some((item) => item.id === body.data.id),
        ).toBe(true);

        const items = await request(app.getHttpServer())
            .get(`/api/v1/operations/billing-runs/${body.data.id}/items`)
            .expect(200);
        const itemsBody = items.body as { data: { items: unknown[] } };
        expect(itemsBody.data.items).toEqual([]);
    });

    it('persists scheduled attempts through the same coordinator path', async () => {
        const startedAt = new Date();

        await scheduler.triggerScheduled();

        const run = await database
            .selectFrom('scheduler_runs')
            .selectAll()
            .where('trigger_type', '=', 'scheduled')
            .where('triggered_at', '>=', startedAt)
            .orderBy('triggered_at', 'desc')
            .executeTakeFirstOrThrow();
        runIds.push(run.id);
        expect(run.status).toBe('completed');
    });

    it('records lock contention and rejects a manual trigger without bypassing the lease', async () => {
        const now = new Date();
        const ownerToken = `blocking-owner:${randomUUID()}`;
        await repository.acquireLease({
            lockName: $billingScheduler.job.NAME,
            ownerToken,
            acquiredAt: now,
            leaseExpiresAt: new Date(now.getTime() + 120_000),
        });

        await request(app.getHttpServer())
            .post('/api/v1/operations/billing-runs')
            .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
            .send({})
            .expect(409);

        const skipped = await database
            .selectFrom('scheduler_runs')
            .selectAll()
            .where('trigger_type', '=', 'manual')
            .where('status', '=', 'skipped_lock_unavailable')
            .orderBy('triggered_at', 'desc')
            .executeTakeFirstOrThrow();
        runIds.push(skipped.id);
        expect(skipped.error_code).toBe('SCHEDULER_LEASE_UNAVAILABLE');

        await repository.releaseLease($billingScheduler.job.NAME, ownerToken);
    });

    it('starts no new scheduler attempts after graceful shutdown begins', async () => {
        const shutdown = app.get(ShutdownState);
        const startedAt = new Date();
        shutdown.beginShutdown();

        await scheduler.triggerScheduled();

        const newRuns = await database
            .selectFrom('scheduler_runs')
            .select('id')
            .where(
                'instance_id',
                '=',
                app.get(AppConfigService).app.INSTANCE_ID,
            )
            .where('triggered_at', '>=', startedAt)
            .execute();
        expect(newRuns).toEqual([]);

        await request(app.getHttpServer())
            .post('/api/v1/operations/billing-runs')
            .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
            .send({})
            .expect(503);
    });
});
