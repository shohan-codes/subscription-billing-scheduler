import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/app-config.service';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';
import { BillingSchedulerService } from '../src/modules/billing-scheduler/billing-scheduler.service';
import { $invoice } from '../src/modules/invoices/invoices.constant';
import { InvoicesService } from '../src/modules/invoices/invoices.service';
import { $subscription } from '../src/modules/subscriptions/subscriptions.constant';

describe('Health and billing metrics (e2e)', () => {
    let app: INestApplication<Server>;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it('keeps liveness and scheduler/database readiness responsive', async () => {
        await request(app.getHttpServer())
            .get('/health/live')
            .expect(200)
            .expect({ status: 'ok' });

        await request(app.getHttpServer())
            .get('/health/ready')
            .expect(200)
            .expect({
                status: 'ok',
                checks: { database: 'up', scheduler: 'up' },
            });
    });

    it('keeps health endpoints responsive while billing work is in flight', async () => {
        const database = app.get<DatabaseClient>($database.token.CLIENT);
        const scheduler = app.get(BillingSchedulerService);
        const invoices = app.get(InvoicesService);
        const instanceId = app.get(AppConfigService).app.INSTANCE_ID;
        const subscriptionId = randomUUID();
        const startedAt = new Date();
        let releaseItem!: () => void;
        const itemGate = new Promise<void>((resolve) => {
            releaseItem = resolve;
        });
        const generate = jest
            .spyOn(invoices, 'generateClaimedCatchUp')
            .mockImplementation(async () => {
                await itemGate;
                return {
                    result: $invoice.generationOutcome.DUPLICATE_CONFIRMED,
                    invoices: [],
                    nextBillingDate: '2000-02-01',
                    periodsProcessed: 1,
                    invoicesCreated: 0,
                    createdCurrencies: [],
                    limitReached: false,
                };
            });

        await database
            .insertInto('subscriptions')
            .values({
                id: subscriptionId,
                customer_reference: `HEALTH-${subscriptionId}`,
                description: 'Health responsiveness subscription',
                status: $subscription.status.ACTIVE,
                billing_state: $subscription.billingState.READY,
                currency: 'USD',
                amount: '10.0000',
                start_date: '2000-01-01',
                next_billing_date: '2000-01-01',
                billing_anchor_day: 1,
                anchor_is_month_end: false,
            })
            .execute();

        try {
            const runPromise = scheduler.triggerScheduled();
            while (generate.mock.calls.length === 0) {
                await new Promise((resolve) => setImmediate(resolve));
            }

            await request(app.getHttpServer()).get('/health/live').expect(200);
            await request(app.getHttpServer()).get('/health/ready').expect(200);

            releaseItem();
            await runPromise;
        } finally {
            releaseItem();
            generate.mockRestore();

            const runs = await database
                .selectFrom('scheduler_runs')
                .select('id')
                .where('instance_id', '=', instanceId)
                .where('triggered_at', '>=', startedAt)
                .execute();
            const runIds = runs.map((run) => run.id);
            if (runIds.length > 0) {
                await database
                    .deleteFrom('scheduler_run_items')
                    .where('run_id', 'in', runIds)
                    .execute();
            }
            await database
                .deleteFrom('subscriptions')
                .where('id', '=', subscriptionId)
                .execute();
            if (runIds.length > 0) {
                await database
                    .deleteFrom('scheduler_runs')
                    .where('id', 'in', runIds)
                    .execute();
            }
        }
    });

    it('exposes the required bounded billing metric families', async () => {
        const response = await request(app.getHttpServer())
            .get('/metrics')
            .expect(200)
            .expect('Content-Type', /text\/plain/);

        expect(response.text).toContain('# TYPE billing_run_total counter');
        expect(response.text).toContain(
            '# TYPE billing_run_duration_seconds histogram',
        );
        expect(response.text).toContain(
            '# TYPE billing_subscription_processed_total counter',
        );
        expect(response.text).toContain(
            '# TYPE billing_item_duration_seconds histogram',
        );
        expect(response.text).toContain(
            '# TYPE billing_invoice_created_total counter',
        );
        expect(response.text).toContain(
            '# TYPE billing_due_subscription_count gauge',
        );
        expect(response.text).toContain(
            '# TYPE billing_claim_expired_total counter',
        );
        expect(response.text).toContain(
            '# TYPE billing_lease_contention_total counter',
        );
        expect(response.text).toContain(
            '# TYPE billing_schedule_lag_days histogram',
        );
    });
});
