import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'kysely';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { AppConfigService } from '../src/config/app-config.service';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';
import { $billingScheduler } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { BillingSchedulerRepository } from '../src/modules/billing-scheduler/billing-scheduler.repository';
import { BillingSchedulerService } from '../src/modules/billing-scheduler/billing-scheduler.service';
import { InvoicesAction } from '../src/modules/invoices/invoices.action';
import { InvoicesRepository } from '../src/modules/invoices/invoices.repository';
import { InvoicesService } from '../src/modules/invoices/invoices.service';
import { $subscription } from '../src/modules/subscriptions/subscriptions.constant';

const CUTOFF_DATE = '1901-01-31';
const INSTANCE_A = `m6-a-${randomUUID()}`;
const INSTANCE_B = `m6-b-${randomUUID()}`;
const CUSTOMER_REFERENCE = `M6-CONCURRENCY-${randomUUID()}`;

type TestInstance = {
    app: INestApplication;
    database: DatabaseClient;
    scheduler: BillingSchedulerService;
    repository: BillingSchedulerRepository;
    invoices: InvoicesService;
    invoiceRepository: InvoicesRepository;
    invoiceAction: InvoicesAction;
};

describe('Multi-instance billing concurrency and recovery (e2e)', () => {
    let first: TestInstance;
    let second: TestInstance;
    const subscriptionIds: string[] = [];
    const customLockNames: string[] = [];

    beforeAll(async () => {
        first = await createInstance(INSTANCE_A);
        second = await createInstance(INSTANCE_B);
    });

    afterAll(async () => {
        const database = first.database;
        const testRuns = await database
            .selectFrom('scheduler_runs')
            .select('id')
            .where('instance_id', 'in', [INSTANCE_A, INSTANCE_B])
            .execute();
        const runIds = testRuns.map((run) => run.id);

        if (runIds.length > 0) {
            await database
                .deleteFrom('scheduler_run_items')
                .where('run_id', 'in', runIds)
                .execute();
        }
        if (subscriptionIds.length > 0) {
            const invoices = await database
                .selectFrom('invoices')
                .select('id')
                .where('subscription_id', 'in', subscriptionIds)
                .execute();
            const invoiceIds = invoices.map((invoice) => invoice.id);
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
        await database
            .deleteFrom('scheduler_locks')
            .where('lock_name', 'in', [
                $billingScheduler.job.NAME,
                ...customLockNames,
            ])
            .execute();

        await second.app.close();
        await first.app.close();
    });

    it('allows only one active coordinator when two instances trigger together', async () => {
        const subscriptionId = randomUUID();
        subscriptionIds.push(subscriptionId);
        await first.database
            .insertInto('subscriptions')
            .values(subscription(subscriptionId))
            .execute();

        let releaseItem!: () => void;
        const itemGate = new Promise<void>((resolve) => {
            releaseItem = resolve;
        });
        const firstGenerate = first.invoices.generateClaimedCatchUp.bind(
            first.invoices,
        );
        const secondGenerate = second.invoices.generateClaimedCatchUp.bind(
            second.invoices,
        );
        const firstSpy = jest
            .spyOn(first.invoices, 'generateClaimedCatchUp')
            .mockImplementation(async (request) => {
                await itemGate;
                return firstGenerate(request);
            });
        const secondSpy = jest
            .spyOn(second.invoices, 'generateClaimedCatchUp')
            .mockImplementation(async (request) => {
                await itemGate;
                return secondGenerate(request);
            });

        const attempts = [
            first.scheduler.triggerManual(),
            second.scheduler.triggerManual(),
        ];
        while (firstSpy.mock.calls.length + secondSpy.mock.calls.length === 0) {
            await new Promise((resolve) => setImmediate(resolve));
        }
        await new Promise((resolve) => setImmediate(resolve));
        releaseItem();
        const results = await Promise.allSettled(attempts);
        firstSpy.mockRestore();
        secondSpy.mockRestore();

        expect(
            results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            results.filter((result) => result.status === 'rejected'),
        ).toHaveLength(1);

        const runs = await first.database
            .selectFrom('scheduler_runs')
            .selectAll()
            .where('instance_id', 'in', [INSTANCE_A, INSTANCE_B])
            .where('cutoff_date', '=', CUTOFF_DATE)
            .execute();
        expect(runs).toHaveLength(2);
        expect(
            runs.filter(
                (run) => run.status === $billingScheduler.runStatus.COMPLETED,
            ),
        ).toHaveLength(1);
        expect(
            runs.filter(
                (run) =>
                    run.status ===
                    $billingScheduler.runStatus.SKIPPED_LOCK_UNAVAILABLE,
            ),
        ).toHaveLength(1);

        const invoices = await first.database
            .selectFrom('invoices')
            .selectAll()
            .where('subscription_id', '=', subscriptionId)
            .execute();
        expect(invoices).toHaveLength(1);
        await expectNoDuplicatePeriods(first.database, [subscriptionId]);
    });

    it('transfers an expired lease without allowing the old owner to renew or release it', async () => {
        const lockName = `m6.lease.${randomUUID()}`;
        customLockNames.push(lockName);
        const acquiredAt = new Date('2026-08-19T10:00:00.000Z');
        const firstOwner = `owner-a:${randomUUID()}`;
        const secondOwner = `owner-b:${randomUUID()}`;

        const acquired = await first.repository.acquireLease({
            lockName,
            ownerToken: firstOwner,
            acquiredAt,
            leaseExpiresAt: new Date('2026-08-19T10:00:01.000Z'),
        });
        expect(acquired?.owner_token).toBe(firstOwner);

        const blocked = await second.repository.acquireLease({
            lockName,
            ownerToken: secondOwner,
            acquiredAt: new Date('2026-08-19T10:00:00.500Z'),
            leaseExpiresAt: new Date('2026-08-19T10:00:02.000Z'),
        });
        expect(blocked).toBeUndefined();

        const recovered = await second.repository.acquireLease({
            lockName,
            ownerToken: secondOwner,
            acquiredAt: new Date('2026-08-19T10:00:02.000Z'),
            leaseExpiresAt: new Date('2026-08-19T10:00:04.000Z'),
        });
        expect(recovered?.owner_token).toBe(secondOwner);

        await expect(
            first.repository.renewLease(
                lockName,
                firstOwner,
                new Date('2026-08-19T10:00:02.100Z'),
                new Date('2026-08-19T10:00:04.100Z'),
            ),
        ).resolves.toBeUndefined();
        await expect(
            first.repository.releaseLease(lockName, firstOwner),
        ).resolves.toBe(false);
        await expect(
            second.repository.releaseLease(lockName, secondOwner),
        ).resolves.toBe(true);
    });

    it('reclaims an expired row claim after a simulated crash', async () => {
        const firstRunId = randomUUID();
        const secondRunId = randomUUID();
        const subscriptionId = randomUUID();
        subscriptionIds.push(subscriptionId);
        await insertRun(first.database, firstRunId, INSTANCE_A, 'owner-a');
        await insertRun(first.database, secondRunId, INSTANCE_B, 'owner-b');
        await first.database
            .insertInto('subscriptions')
            .values({
                ...subscription(subscriptionId),
                processing_run_id: firstRunId,
                processing_owner: 'owner-a',
                processing_started_at: new Date('2026-08-19T09:00:00.000Z'),
                processing_expires_at: new Date('2026-08-19T09:01:00.000Z'),
            })
            .execute();

        const claimed = await second.repository.claimDueBatchWithStats({
            cutoffDate: CUTOFF_DATE,
            now: new Date('2026-08-19T10:00:00.000Z'),
            limit: 1,
            runId: secondRunId,
            owner: 'owner-b',
            claimStartedAt: new Date('2026-08-19T10:00:00.000Z'),
            claimExpiresAt: new Date('2099-08-19T10:05:00.000Z'),
        });

        expect(claimed.expiredClaimCount).toBe(1);
        expect(claimed.subscriptions.map((row) => row.id)).toEqual([
            subscriptionId,
        ]);
        expect(claimed.subscriptions[0]?.processing_run_id).toBe(secondRunId);
        expect(claimed.subscriptions[0]?.processing_owner).toBe('owner-b');
    });

    it('rolls back a crash before item commit and safely completes a later retry', async () => {
        const crashedRunId = randomUUID();
        const retryRunId = randomUUID();
        const subscriptionId = randomUUID();
        const crashedOwner = `crashed:${randomUUID()}`;
        const retryOwner = `retry:${randomUUID()}`;
        subscriptionIds.push(subscriptionId);
        await insertRun(
            first.database,
            crashedRunId,
            INSTANCE_A,
            crashedOwner,
        );
        await insertRun(second.database, retryRunId, INSTANCE_B, retryOwner);
        await first.database
            .insertInto('subscriptions')
            .values({
                ...subscription(subscriptionId),
                processing_run_id: crashedRunId,
                processing_owner: crashedOwner,
                processing_started_at: new Date(),
                processing_expires_at: new Date('2099-01-01T00:00:00.000Z'),
            })
            .execute();

        await expect(
            first.invoiceRepository.withTransaction(async (transaction) => {
                const locked =
                    await transaction.findSubscriptionForUpdateOrThrow(
                        subscriptionId,
                    );
                const request = {
                    subscriptionId,
                    runId: crashedRunId,
                    owner: crashedOwner,
                    cutoffDate: CUTOFF_DATE,
                };
                first.invoiceAction.validateClaimedSubscriptionOrThrow(
                    locked,
                    request,
                    new Date(),
                );
                const draft = first.invoiceAction.buildGenerationDraft(
                    locked,
                    request,
                );
                await transaction.createInvoice(draft.invoice);
                throw new Error('simulated crash before commit');
            }),
        ).rejects.toThrow('simulated crash before commit');

        const afterCrash = await first.database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', subscriptionId)
            .executeTakeFirstOrThrow();
        expect(afterCrash.next_billing_date).toBe(CUTOFF_DATE);
        expect(afterCrash.processing_run_id).toBe(crashedRunId);
        expect(
            await first.database
                .selectFrom('invoices')
                .select('id')
                .where('subscription_id', '=', subscriptionId)
                .execute(),
        ).toHaveLength(0);

        await first.database
            .updateTable('subscriptions')
            .set({
                processing_expires_at: new Date('2026-08-19T09:00:00.000Z'),
            })
            .where('id', '=', subscriptionId)
            .execute();
        const reclaimed = await second.repository.claimDueBatchWithStats({
            cutoffDate: CUTOFF_DATE,
            now: new Date('2026-08-19T10:00:00.000Z'),
            limit: 1,
            runId: retryRunId,
            owner: retryOwner,
            claimStartedAt: new Date('2026-08-19T10:00:00.000Z'),
            claimExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        });
        expect(reclaimed.subscriptions.map((row) => row.id)).toContain(
            subscriptionId,
        );

        await second.invoices.generateClaimedCatchUp({
            subscriptionId,
            runId: retryRunId,
            owner: retryOwner,
            cutoffDate: CUTOFF_DATE,
            maxPeriods: 1,
        });

        const committed = await second.database
            .selectFrom('subscriptions')
            .selectAll()
            .where('id', '=', subscriptionId)
            .executeTakeFirstOrThrow();
        expect(committed.next_billing_date).toBe('1901-02-28');
        expect(committed.processing_run_id).toBeNull();
        expect(
            await second.database
                .selectFrom('invoices')
                .select('id')
                .where('subscription_id', '=', subscriptionId)
                .execute(),
        ).toHaveLength(1);

        const laterRunId = randomUUID();
        await insertRun(second.database, laterRunId, INSTANCE_B, 'later-owner');
        const laterClaim = await second.repository.claimDueBatch({
            cutoffDate: CUTOFF_DATE,
            now: new Date('2026-08-19T11:00:00.000Z'),
            limit: 1,
            runId: laterRunId,
            owner: 'later-owner',
            claimStartedAt: new Date('2026-08-19T11:00:00.000Z'),
            claimExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        });
        expect(laterClaim.map((row) => row.id)).not.toContain(subscriptionId);
        await expectNoDuplicatePeriods(second.database, [subscriptionId]);
    });
});

/** Creates one isolated Nest application instance sharing the test PostgreSQL database. */
async function createInstance(instanceId: string): Promise<TestInstance> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();
    Object.assign(moduleFixture.get(AppConfigService).app, {
        INSTANCE_ID: instanceId,
    });
    Object.assign(moduleFixture.get(AppConfigService).billing, {
        CRON_ENABLED: false,
        TIMEZONE: 'UTC',
    });
    jest.spyOn(moduleFixture.get(Clock), 'dateInTimeZone').mockReturnValue(
        CUTOFF_DATE,
    );

    const app = moduleFixture.createNestApplication();
    await app.init();
    return {
        app,
        database: app.get<DatabaseClient>($database.token.CLIENT),
        scheduler: app.get(BillingSchedulerService),
        repository: app.get(BillingSchedulerRepository),
        invoices: app.get(InvoicesService),
        invoiceRepository: app.get(InvoicesRepository),
        invoiceAction: app.get(InvoicesAction),
    };
}

/** Builds a due active subscription for concurrency scenarios. */
function subscription(id: string) {
    return {
        id,
        customer_reference: CUSTOMER_REFERENCE,
        description: 'Multi-instance concurrency subscription',
        status: $subscription.status.ACTIVE,
        billing_state: $subscription.billingState.READY,
        currency: 'USD',
        amount: '10.0000',
        start_date: CUTOFF_DATE,
        next_billing_date: CUTOFF_DATE,
        billing_anchor_day: 31,
        anchor_is_month_end: false,
    };
}

/** Inserts a running scheduler record used by claim and transaction recovery tests. */
async function insertRun(
    database: DatabaseClient,
    id: string,
    instanceId: string,
    ownerToken: string,
): Promise<void> {
    const now = new Date('2026-08-19T10:00:00.000Z');
    await database
        .insertInto('scheduler_runs')
        .values({
            id,
            job_name: $billingScheduler.job.NAME,
            trigger_type: $billingScheduler.triggerType.MANUAL,
            triggered_at: now,
            cutoff_date: CUTOFF_DATE,
            status: $billingScheduler.runStatus.RUNNING,
            instance_id: instanceId,
            lease_owner_token: ownerToken,
            started_at: now,
            last_heartbeat_at: now,
        })
        .execute();
}

/** Asserts the database contains no duplicate subscription-period invoice groups. */
async function expectNoDuplicatePeriods(
    database: DatabaseClient,
    ids: readonly string[],
): Promise<void> {
    const duplicates = await database
        .selectFrom('invoices')
        .select([
            'subscription_id',
            'billing_period_start',
            'billing_period_end',
            sql<number>`count(*)::int`.as('count'),
        ])
        .where('subscription_id', 'in', [...ids])
        .groupBy([
            'subscription_id',
            'billing_period_start',
            'billing_period_end',
        ])
        .having(sql<number>`count(*)`, '>', 1)
        .execute();

    expect(duplicates).toEqual([]);
}
