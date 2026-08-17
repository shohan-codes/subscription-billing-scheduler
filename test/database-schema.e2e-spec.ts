import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { DatabaseSchema } from '../src/database/database.types';

const database = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
        pool: new Pool({
            connectionString:
                process.env.DATABASE_URL ??
                'postgresql://billing:billing@localhost:5432/subscription_billing',
        }),
    }),
});

describe('Core database schema', () => {
    afterAll(async () => {
        await database.destroy();
    });

    it('contains the required tables, keys, and indexes', async () => {
        const tables = await sql<{ table_name: string }>`
            select table_name
            from information_schema.tables
            where table_schema = 'public'
              and table_name in (
                'subscriptions',
                'invoices',
                'invoice_items',
                'scheduler_runs',
                'scheduler_run_items',
                'scheduler_locks'
              )
        `.execute(database);

        expect(tables.rows.map(({ table_name }) => table_name).sort()).toEqual([
            'invoice_items',
            'invoices',
            'scheduler_locks',
            'scheduler_run_items',
            'scheduler_runs',
            'subscriptions',
        ]);

        const foreignKeys = await sql<{
            table_name: string;
            column_name: string;
            foreign_table_name: string;
        }>`
            select
                tc.table_name,
                kcu.column_name,
                ccu.table_name as foreign_table_name
            from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu
              on tc.constraint_name = kcu.constraint_name
             and tc.constraint_schema = kcu.constraint_schema
            join information_schema.constraint_column_usage ccu
              on tc.constraint_name = ccu.constraint_name
             and tc.constraint_schema = ccu.constraint_schema
            where tc.constraint_type = 'FOREIGN KEY'
              and tc.table_schema = 'public'
              and tc.table_name in (
                'subscriptions',
                'invoices',
                'invoice_items',
                'scheduler_run_items'
              )
        `.execute(database);

        expect(
            foreignKeys.rows
                .map(
                    ({ table_name, column_name, foreign_table_name }) =>
                        `${table_name}.${column_name}->${foreign_table_name}`,
                )
                .sort(),
        ).toEqual([
            'invoice_items.invoice_id->invoices',
            'invoices.generated_by_run_id->scheduler_runs',
            'invoices.subscription_id->subscriptions',
            'scheduler_run_items.run_id->scheduler_runs',
            'scheduler_run_items.subscription_id->subscriptions',
            'subscriptions.processing_run_id->scheduler_runs',
        ]);

        const indexes = await sql<{ indexname: string; indexdef: string }>`
            select indexname, indexdef
            from pg_indexes
            where schemaname = 'public'
              and indexname in (
                'subscriptions_due_idx',
                'subscriptions_claim_expiry_idx',
                'invoices_period_uniq',
                'invoices_idempotency_uniq',
                'invoices_customer_date_idx',
                'run_items_run_result_idx',
                'runs_job_time_idx'
              )
        `.execute(database);

        expect(indexes.rows.map(({ indexname }) => indexname).sort()).toEqual([
            'invoices_customer_date_idx',
            'invoices_idempotency_uniq',
            'invoices_period_uniq',
            'run_items_run_result_idx',
            'runs_job_time_idx',
            'subscriptions_claim_expiry_idx',
            'subscriptions_due_idx',
        ]);

        const constraints = await sql<{ constraint_name: string }>`
            select constraint_name
            from information_schema.table_constraints
            where table_schema = 'public'
              and table_name = 'invoices'
              and constraint_type = 'UNIQUE'
              and constraint_name in (
                'invoices_period_uniq',
                'invoices_idempotency_uniq'
              )
        `.execute(database);

        expect(
            constraints.rows
                .map(({ constraint_name }) => constraint_name)
                .sort(),
        ).toEqual(['invoices_idempotency_uniq', 'invoices_period_uniq']);
    });
});
