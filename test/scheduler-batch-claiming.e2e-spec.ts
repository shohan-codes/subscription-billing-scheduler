import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DATABASE, type DatabaseClient } from '../src/database/database.module';
import {
    BillingSchedulerRepository,
} from '../src/modules/billing-scheduler/billing-scheduler.repository';

const CUSTOMER_REFERENCE = `CLAIM-${randomUUID()}`;

describe('Due subscription batch claiming (e2e)', () => {
    let app: INestApplication;
    let database: DatabaseClient;
    let repository: BillingSchedulerRepository;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        database = app.get<DatabaseClient>(DATABASE);
        repository = app.get(BillingSchedulerRepository);
    });

    afterAll(async () => {
        await database
            .deleteFrom('subscriptions')
            .where('customer_reference', '=', CUSTOMER_REFERENCE)
            .execute();
        await app.close();
    });

    it('selects only eligible due rows in deterministic bounded order', async () => {
        const now = new Date('2026-08-18T12:00:00.000Z');
        const firstId = '00000000-0000-4000-8000-000000000101';
        const secondId = '00000000-0000-4000-8000-000000000102';
        const thirdId = '00000000-0000-4000-8000-000000000103';
        const fourthId = '00000000-0000-4000-8000-000000000104';

        await database
            .insertInto('subscriptions')
            .values([
                subscription(firstId, '2026-08-17'),
                subscription(thirdId, '2026-08-18'),
                subscription(secondId, '2026-08-18'),
                subscription(randomUUID(), '2026-08-19'),
                subscription(randomUUID(), '2026-08-18', { status: 'paused' }),
                subscription(randomUUID(), '2026-08-18', {
                    status: 'canceled',
                }),
                subscription(randomUUID(), '2026-08-18', {
                    billing_state: 'blocked',
                }),
                subscription(randomUUID(), '2026-08-18', {
                    billing_state: 'retry_wait',
                    billing_retry_at: new Date('2026-08-18T13:00:00.000Z'),
                }),
                subscription(fourthId, '2026-08-18', {
                    billing_state: 'retry_wait',
                    billing_retry_at: new Date('2026-08-18T11:00:00.000Z'),
                }),
            ])
            .execute();

        const firstBatch = await repository.findDueBatch({
            cutoffDate: '2026-08-18',
            now,
            limit: 2,
        });
        const secondBatch = await repository.findDueBatch({
            cutoffDate: '2026-08-18',
            now,
            limit: 10,
        });

        expect(firstBatch.map((row) => row.id)).toEqual([firstId, secondId]);
        expect(secondBatch.map((row) => row.id)).toEqual([
            firstId,
            secondId,
            thirdId,
            fourthId,
        ]);
    });

    it('skips a due row locked by another transaction', async () => {
        const lockedId = '00000000-0000-4000-8000-000000000201';
        const availableId = '00000000-0000-4000-8000-000000000202';
        await database
            .insertInto('subscriptions')
            .values([
                subscription(lockedId, '2026-08-16'),
                subscription(availableId, '2026-08-16'),
            ])
            .execute();

        let releaseLock: (() => void) | undefined;
        let resolveLocked: (() => void) | undefined;
        const locked = new Promise<void>((resolve) => {
            resolveLocked = resolve;
        });
        const holdLock = database.transaction().execute(async (transaction) => {
            await transaction
                .selectFrom('subscriptions')
                .select('id')
                .where('id', '=', lockedId)
                .forUpdate()
                .executeTakeFirstOrThrow();
            resolveLocked?.();
            await new Promise<void>((resolve) => {
                releaseLock = resolve;
            });
        });

        await locked;
        const batch = await repository.findDueBatch({
            cutoffDate: '2026-08-18',
            now: new Date('2026-08-18T12:00:00.000Z'),
            limit: 1,
        });
        releaseLock?.();
        await holdLock;

        expect(batch).toHaveLength(1);
        expect(batch[0]?.id).toBe(availableId);
    });
});

type SubscriptionOverrides = Partial<{
    status: 'active' | 'paused' | 'canceled';
    billing_state: 'ready' | 'retry_wait' | 'blocked';
    billing_retry_at: Date | null;
}>;

/** Builds a subscription row for due-selection acceptance tests. */
function subscription(
    id: string,
    nextBillingDate: string,
    overrides: SubscriptionOverrides = {},
) {
    return {
        id,
        customer_reference: CUSTOMER_REFERENCE,
        description: 'Claim test subscription',
        status: overrides.status ?? 'active',
        billing_state: overrides.billing_state ?? 'ready',
        currency: 'USD',
        amount: '10.0000',
        start_date: '2026-01-01',
        next_billing_date: nextBillingDate,
        billing_anchor_day: 18,
        anchor_is_month_end: false,
        billing_retry_at: overrides.billing_retry_at ?? null,
    };
}
