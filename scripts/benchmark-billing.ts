import { randomUUID } from 'node:crypto';
import { cpus, freemem, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { AppConfigService } from '../src/config/app-config.service';
import { $database } from '../src/database/database.constant';
import type { DatabaseClient } from '../src/database/database.module';
import { $billingScheduler } from '../src/modules/billing-scheduler/billing-scheduler.constant';
import { BillingSchedulerService } from '../src/modules/billing-scheduler/billing-scheduler.service';
import { $subscription } from '../src/modules/subscriptions/subscriptions.constant';

const DEFAULT_SUBSCRIPTION_COUNT = 10_000;
const SEED_CHUNK_SIZE = 500;

type DatabaseStats = {
    xactCommit: number;
    xactRollback: number;
    blocksRead: number;
    blocksHit: number;
    rowsInserted: number;
    rowsUpdated: number;
};

type BenchmarkOptions = {
    subscriptionCount: number;
    reportPath?: string;
    keepData: boolean;
};

type ScenarioReport = {
    instances: number;
    subscriptionCount: number;
    durationMs: number;
    throughputPerSecond: number;
    batchSize: number;
    concurrency: number;
    databasePoolMax: number;
    databaseCacheHitRatio: number;
    bottleneckSummary: string;
    runStatuses: Record<string, number>;
    runClaimedCount: number;
    runSucceededCount: number;
    runFailedCount: number;
    runInvoicesCreatedCount: number;
    persistedRunItemCount: number;
    persistedInvoiceCount: number;
    duplicatePeriodGroups: number;
    dueSubscriptionsRemaining: number;
    unexpiredOrphanClaims: number;
    countersReconcile: boolean;
    databaseDelta: DatabaseStats;
};

/** Runs both required local benchmark demonstrations and optionally writes a Markdown report. */
async function benchmark(): Promise<void> {
    const options = parseOptions(process.argv.slice(2));
    if (options.subscriptionCount < DEFAULT_SUBSCRIPTION_COUNT) {
        throw new Error('Benchmark subscription count must be at least 10000');
    }

    const reports = [
        await runScenario(1, options),
        await runScenario(2, options),
    ];
    const markdown = renderReport(reports);
    console.log(markdown);

    if (options.reportPath) {
        await writeFile(resolve(options.reportPath), markdown, 'utf8');
    }
}

/** Executes one benchmark scenario with isolated Nest instances sharing PostgreSQL. */
async function runScenario(
    instanceCount: number,
    options: BenchmarkOptions,
): Promise<ScenarioReport> {
    const subscriptionCount = options.subscriptionCount;
    const scenarioId = randomUUID();
    const customerReference = `BENCH-${instanceCount}-${scenarioId}`;
    const apps: INestApplication[] = [];

    try {
        for (let index = 0; index < instanceCount; index += 1) {
            const moduleFixture = await Test.createTestingModule({
                imports: [AppModule],
            }).compile();
            Object.assign(moduleFixture.get(AppConfigService).app, {
                INSTANCE_ID: `benchmark-${instanceCount}-${index + 1}-${scenarioId}`,
            });
            Object.assign(moduleFixture.get(AppConfigService).billing, {
                CRON_ENABLED: false,
            });
            const app = moduleFixture.createNestApplication();
            await app.init();
            apps.push(app);
        }

        const database = apps[0].get<DatabaseClient>($database.token.CLIENT);
        const config = apps[0].get(AppConfigService);
        const clock = apps[0].get(Clock);
        const cutoffDate = clock.dateInTimeZone(
            config.billing.TIMEZONE,
            clock.now(),
        );
        await seedSubscriptions(
            database,
            customerReference,
            cutoffDate,
            subscriptionCount,
        );

        const beforeStats = await readDatabaseStats(database);
        const startedAt = new Date();
        const startedMs = Date.now();
        await Promise.all(
            apps.map((app) =>
                app.get(BillingSchedulerService).triggerScheduled(),
            ),
        );
        const durationMs = Date.now() - startedMs;
        const afterStats = await readDatabaseStats(database);

        const report = await collectReport(
            database,
            apps.map((app) => app.get(AppConfigService).app.INSTANCE_ID),
            customerReference,
            startedAt,
            durationMs,
            subscriptionCount,
            config.billing.BATCH_SIZE,
            config.billing.CONCURRENCY,
            config.database.POOL_MAX,
            diffDatabaseStats(beforeStats, afterStats),
        );

        if (!options.keepData) {
            await cleanupScenario(
                database,
                customerReference,
                apps.map((app) => app.get(AppConfigService).app.INSTANCE_ID),
                startedAt,
            );
        }
        return report;
    } finally {
        await Promise.allSettled(
            apps.reverse().map((app) => app.close()),
        );
    }
}

/** Seeds the benchmark workload in bounded insert chunks. */
async function seedSubscriptions(
    database: DatabaseClient,
    customerReference: string,
    cutoffDate: string,
    count: number,
): Promise<void> {
    const anchorDay = Number(cutoffDate.slice(-2));

    for (let offset = 0; offset < count; offset += SEED_CHUNK_SIZE) {
        const size = Math.min(SEED_CHUNK_SIZE, count - offset);
        const rows = Array.from({ length: size }, (_, index) => ({
            id: randomUUID(),
            customer_reference: customerReference,
            description: `Benchmark subscription ${offset + index + 1}`,
            status: $subscription.status.ACTIVE,
            billing_state: $subscription.billingState.READY,
            currency: 'USD',
            amount: '10.0000',
            start_date: cutoffDate,
            next_billing_date: cutoffDate,
            billing_anchor_day: anchorDay,
            anchor_is_month_end: false,
        }));
        await database.insertInto('subscriptions').values(rows).execute();
    }
}

/** Collects persisted correctness, throughput, run-counter, and recovery evidence. */
async function collectReport(
    database: DatabaseClient,
    instanceIds: string[],
    customerReference: string,
    startedAt: Date,
    durationMs: number,
    subscriptionCount: number,
    batchSize: number,
    concurrency: number,
    databasePoolMax: number,
    databaseDelta: DatabaseStats,
): Promise<ScenarioReport> {
    const runs = await database
        .selectFrom('scheduler_runs')
        .selectAll()
        .where('instance_id', 'in', instanceIds)
        .where('triggered_at', '>=', startedAt)
        .execute();
    const runIds = runs.map((run) => run.id);
    const runStatuses = Object.fromEntries(
        Object.values($billingScheduler.runStatus).map((status) => [status, 0]),
    ) as Record<string, number>;
    for (const run of runs) runStatuses[run.status] += 1;

    const itemSummary =
        runIds.length === 0
            ? { count: 0, invoicesCreated: 0 }
            : await database
                  .selectFrom('scheduler_run_items')
                  .select([
                      sql<number>`count(*)::int`.as('count'),
                      sql<number>`coalesce(sum(invoices_created), 0)::int`.as(
                          'invoicesCreated',
                      ),
                  ])
                  .where('run_id', 'in', runIds)
                  .executeTakeFirstOrThrow();
    const invoiceCount = await countBenchmarkInvoices(
        database,
        customerReference,
    );
    const duplicatePeriodGroups = await countDuplicatePeriods(
        database,
        customerReference,
    );
    const dueSubscriptionsRemaining = await database
        .selectFrom('subscriptions')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('customer_reference', '=', customerReference)
        .where('next_billing_date', '<=', runs[0]?.cutoff_date ?? '0001-01-01')
        .executeTakeFirstOrThrow();
    const unexpiredOrphanClaims = await database
        .selectFrom('subscriptions')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('customer_reference', '=', customerReference)
        .where('processing_expires_at', '>', new Date())
        .executeTakeFirstOrThrow();

    const runClaimedCount = sum(runs.map((run) => run.claimed_count));
    const runSucceededCount = sum(runs.map((run) => run.succeeded_count));
    const runFailedCount = sum(runs.map((run) => run.failed_count));
    const runInvoicesCreatedCount = sum(
        runs.map((run) => run.invoices_created_count),
    );
    const persistedRunItemCount = Number(itemSummary.count);
    const persistedInvoiceCount = Number(invoiceCount);
    const itemInvoicesCreated = Number(itemSummary.invoicesCreated);

    const databaseCacheHitRatio = cacheHitRatio(databaseDelta);

    return {
        instances: instanceIds.length,
        subscriptionCount,
        durationMs,
        throughputPerSecond:
            durationMs > 0
                ? Number((persistedInvoiceCount / (durationMs / 1000)).toFixed(2))
                : persistedInvoiceCount,
        batchSize,
        concurrency,
        databasePoolMax,
        databaseCacheHitRatio,
        bottleneckSummary: summarizeBottlenecks(
            databaseDelta,
            databaseCacheHitRatio,
        ),
        runStatuses,
        runClaimedCount,
        runSucceededCount,
        runFailedCount,
        runInvoicesCreatedCount,
        persistedRunItemCount,
        persistedInvoiceCount,
        duplicatePeriodGroups,
        dueSubscriptionsRemaining: Number(dueSubscriptionsRemaining.count),
        unexpiredOrphanClaims: Number(unexpiredOrphanClaims.count),
        countersReconcile:
            runClaimedCount === persistedRunItemCount &&
            runSucceededCount + runFailedCount === persistedRunItemCount &&
            runInvoicesCreatedCount === persistedInvoiceCount &&
            itemInvoicesCreated === persistedInvoiceCount,
        databaseDelta,
    };
}

/** Reads bounded PostgreSQL database activity counters for bottleneck evidence. */
async function readDatabaseStats(database: DatabaseClient): Promise<DatabaseStats> {
    const result = await sql<{
        xact_commit: string;
        xact_rollback: string;
        blks_read: string;
        blks_hit: string;
        tup_inserted: string;
        tup_updated: string;
    }>`
        select xact_commit, xact_rollback, blks_read, blks_hit, tup_inserted, tup_updated
        from pg_stat_database
        where datname = current_database()
    `.execute(database);
    const row = result.rows[0];
    if (!row) throw new Error('PostgreSQL statistics are unavailable');

    return {
        xactCommit: Number(row.xact_commit),
        xactRollback: Number(row.xact_rollback),
        blocksRead: Number(row.blks_read),
        blocksHit: Number(row.blks_hit),
        rowsInserted: Number(row.tup_inserted),
        rowsUpdated: Number(row.tup_updated),
    };
}

/** Counts persisted invoices for one benchmark workload. */
async function countBenchmarkInvoices(
    database: DatabaseClient,
    customerReference: string,
): Promise<number> {
    const row = await database
        .selectFrom('invoices')
        .innerJoin(
            'subscriptions',
            'subscriptions.id',
            'invoices.subscription_id',
        )
        .select(sql<number>`count(*)::int`.as('count'))
        .where('subscriptions.customer_reference', '=', customerReference)
        .executeTakeFirstOrThrow();
    return Number(row.count);
}

/** Counts duplicate subscription-period groups for one benchmark workload. */
async function countDuplicatePeriods(
    database: DatabaseClient,
    customerReference: string,
): Promise<number> {
    const duplicates = await database
        .selectFrom('invoices')
        .innerJoin(
            'subscriptions',
            'subscriptions.id',
            'invoices.subscription_id',
        )
        .select('invoices.subscription_id')
        .where('subscriptions.customer_reference', '=', customerReference)
        .groupBy([
            'invoices.subscription_id',
            'invoices.billing_period_start',
            'invoices.billing_period_end',
        ])
        .having(sql<number>`count(*)`, '>', 1)
        .execute();
    return duplicates.length;
}

/** Removes benchmark rows unless explicit evidence retention was requested. */
async function cleanupScenario(
    database: DatabaseClient,
    customerReference: string,
    instanceIds: string[],
    startedAt: Date,
): Promise<void> {
    const runRows = await database
        .selectFrom('scheduler_runs')
        .select('id')
        .where('instance_id', 'in', instanceIds)
        .where('triggered_at', '>=', startedAt)
        .execute();
    const runIds = runRows.map((run) => run.id);
    if (runIds.length > 0) {
        await database
            .deleteFrom('scheduler_run_items')
            .where('run_id', 'in', runIds)
            .execute();
    }

    const subscriptionIds = database
        .selectFrom('subscriptions')
        .select('id')
        .where('customer_reference', '=', customerReference);
    const invoiceIds = database
        .selectFrom('invoices')
        .select('id')
        .where('subscription_id', 'in', subscriptionIds);
    await database
        .deleteFrom('invoice_items')
        .where('invoice_id', 'in', invoiceIds)
        .execute();
    await database
        .deleteFrom('invoices')
        .where('subscription_id', 'in', subscriptionIds)
        .execute();
    await database
        .deleteFrom('subscriptions')
        .where('customer_reference', '=', customerReference)
        .execute();
    if (runIds.length > 0) {
        await database
            .deleteFrom('scheduler_runs')
            .where('id', 'in', runIds)
            .execute();
    }
    await database
        .deleteFrom('scheduler_locks')
        .where('lock_name', '=', $billingScheduler.job.NAME)
        .execute();
}

/** Renders benchmark evidence without exposing credentials or connection details. */
function renderReport(reports: ScenarioReport[]): string {
    const hardware = {
        cpuCount: cpus().length,
        totalMemoryMb: Math.round(totalmem() / 1024 / 1024),
        freeMemoryMb: Math.round(freemem() / 1024 / 1024),
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
    };
    const lines = [
        '# Billing benchmark results',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        '## Hardware limits',
        '',
        '```json',
        JSON.stringify(hardware, null, 2),
        '```',
    ];

    for (const report of reports) {
        lines.push(
            '',
            `## ${report.instances}-instance run`,
            '',
            '```json',
            JSON.stringify(report, null, 2),
            '```',
            '',
            `Result: duplicate period groups = **${report.duplicatePeriodGroups}**, unexpired orphan claims = **${report.unexpiredOrphanClaims}**, counters reconcile = **${report.countersReconcile}**.`,
        );
    }

    lines.push(
        '',
        '## Bottleneck notes',
        '',
        'Compare `databaseDelta.blocksRead` with `blocksHit`, transaction counts, throughput, batch size, and concurrency between the one-instance and two-instance runs. Record any environment-specific CPU, I/O, connection-pool, or lock bottleneck observed during execution.',
        '',
    );
    return lines.join('\n');
}

/** Calculates the PostgreSQL shared-buffer cache hit ratio for the observed run. */
function cacheHitRatio(stats: DatabaseStats): number {
    const totalBlocks = stats.blocksHit + stats.blocksRead;
    return totalBlocks === 0
        ? 1
        : Number((stats.blocksHit / totalBlocks).toFixed(4));
}

/** Summarizes the database counters into a small benchmark bottleneck indicator. */
function summarizeBottlenecks(
    stats: DatabaseStats,
    cacheRatio: number,
): string {
    const indicators: string[] = [];
    if (stats.xactRollback > 0) {
        indicators.push('transaction rollbacks occurred');
    }
    if (cacheRatio < 0.95) {
        indicators.push('PostgreSQL cache misses were material');
    }
    if (stats.blocksRead > stats.blocksHit) {
        indicators.push('physical block reads exceeded cache hits');
    }

    return indicators.length > 0
        ? indicators.join('; ')
        : 'No obvious rollback or buffer-cache pressure was detected; compare throughput with host CPU, I/O, and pool limits.';
}

/** Computes non-negative deltas for cumulative PostgreSQL statistics. */
function diffDatabaseStats(
    before: DatabaseStats,
    after: DatabaseStats,
): DatabaseStats {
    return {
        xactCommit: Math.max(0, after.xactCommit - before.xactCommit),
        xactRollback: Math.max(0, after.xactRollback - before.xactRollback),
        blocksRead: Math.max(0, after.blocksRead - before.blocksRead),
        blocksHit: Math.max(0, after.blocksHit - before.blocksHit),
        rowsInserted: Math.max(0, after.rowsInserted - before.rowsInserted),
        rowsUpdated: Math.max(0, after.rowsUpdated - before.rowsUpdated),
    };
}

/** Parses benchmark-only CLI flags without altering application configuration. */
function parseOptions(args: readonly string[]): BenchmarkOptions {
    let subscriptionCount = DEFAULT_SUBSCRIPTION_COUNT;
    let reportPath: string | undefined;
    let keepData = false;

    for (const argument of args) {
        if (argument.startsWith('--subscriptions=')) {
            const parsed = Number(argument.slice('--subscriptions='.length));
            if (!Number.isInteger(parsed) || parsed <= 0) {
                throw new Error('--subscriptions must be a positive integer');
            }
            subscriptionCount = parsed;
        } else if (argument.startsWith('--report=')) {
            reportPath = argument.slice('--report='.length);
            if (!reportPath) throw new Error('--report requires a file path');
        } else if (argument === '--keep-data') {
            keepData = true;
        } else {
            throw new Error(`Unknown benchmark option: ${argument}`);
        }
    }

    return { subscriptionCount, reportPath, keepData };
}

/** Adds a list of integer values. */
function sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

void benchmark().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Benchmark failed';
    console.error(message);
    process.exitCode = 1;
});
