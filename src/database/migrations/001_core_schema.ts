import { type Kysely, sql } from 'kysely';

/** Creates the Phase 2 core database schema and indexes. */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('scheduler_runs')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('job_name', 'varchar(100)', (column) => column.notNull())
        .addColumn('trigger_type', 'varchar(20)', (column) => column.notNull())
        .addColumn('triggered_at', 'timestamptz', (column) => column.notNull())
        .addColumn('cutoff_date', 'date', (column) => column.notNull())
        .addColumn('status', 'varchar(40)', (column) => column.notNull())
        .addColumn('instance_id', 'varchar(120)', (column) => column.notNull())
        .addColumn('lease_owner_token', 'varchar(160)')
        .addColumn('started_at', 'timestamptz')
        .addColumn('completed_at', 'timestamptz')
        .addColumn('last_heartbeat_at', 'timestamptz')
        .addColumn('eligible_count', 'integer', (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('claimed_count', 'integer', (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('succeeded_count', 'integer', (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('failed_count', 'integer', (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('skipped_count', 'integer', (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('invoices_created_count', 'integer', (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('error_code', 'varchar(80)')
        .addColumn('error_message', 'varchar(500)')
        .addColumn('created_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addColumn('updated_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addCheckConstraint(
            'scheduler_runs_trigger_type_check',
            sql`trigger_type in ('scheduled', 'manual')`,
        )
        .addCheckConstraint(
            'scheduler_runs_status_check',
            sql`status in ('running', 'completed', 'completed_with_errors', 'failed', 'skipped_lock_unavailable', 'abandoned', 'interrupted')`,
        )
        .addCheckConstraint(
            'scheduler_runs_counts_check',
            sql`eligible_count >= 0 and claimed_count >= 0 and succeeded_count >= 0 and failed_count >= 0 and skipped_count >= 0 and invoices_created_count >= 0`,
        )
        .execute();

    await db.schema
        .createTable('subscriptions')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('customer_reference', 'varchar(100)', (column) =>
            column.notNull(),
        )
        .addColumn('description', 'varchar(255)', (column) => column.notNull())
        .addColumn('status', 'varchar(20)', (column) => column.notNull())
        .addColumn('billing_state', 'varchar(20)', (column) => column.notNull())
        .addColumn('currency', 'char(3)', (column) => column.notNull())
        .addColumn('amount', sql`numeric(19, 4)`, (column) => column.notNull())
        .addColumn('start_date', 'date', (column) => column.notNull())
        .addColumn('next_billing_date', 'date', (column) => column.notNull())
        .addColumn('billing_anchor_day', 'smallint', (column) =>
            column.notNull(),
        )
        .addColumn('anchor_is_month_end', 'boolean', (column) =>
            column.notNull(),
        )
        .addColumn('billing_failure_count', 'integer', (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('billing_retry_at', 'timestamptz')
        .addColumn('last_billing_error_code', 'varchar(80)')
        .addColumn('last_billing_error_message', 'varchar(500)')
        .addColumn('processing_run_id', 'uuid', (column) =>
            column.references('scheduler_runs.id'),
        )
        .addColumn('processing_owner', 'varchar(120)')
        .addColumn('processing_started_at', 'timestamptz')
        .addColumn('processing_expires_at', 'timestamptz')
        .addColumn('version', 'integer', (column) =>
            column.notNull().defaultTo(1),
        )
        .addColumn('created_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addColumn('updated_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addCheckConstraint(
            'subscriptions_status_check',
            sql`status in ('active', 'paused', 'canceled')`,
        )
        .addCheckConstraint(
            'subscriptions_billing_state_check',
            sql`billing_state in ('ready', 'retry_wait', 'blocked')`,
        )
        .addCheckConstraint(
            'subscriptions_currency_check',
            sql`currency ~ '^[A-Z]{3}$'`,
        )
        .addCheckConstraint('subscriptions_amount_check', sql`amount > 0`)
        .addCheckConstraint(
            'subscriptions_anchor_day_check',
            sql`billing_anchor_day between 1 and 31`,
        )
        .addCheckConstraint(
            'subscriptions_failure_count_check',
            sql`billing_failure_count >= 0`,
        )
        .addCheckConstraint('subscriptions_version_check', sql`version >= 1`)
        .execute();

    await db.schema
        .createTable('scheduler_locks')
        .addColumn('lock_name', 'varchar(100)', (column) => column.primaryKey())
        .addColumn('owner_token', 'varchar(160)', (column) => column.notNull())
        .addColumn('acquired_at', 'timestamptz', (column) => column.notNull())
        .addColumn('lease_expires_at', 'timestamptz', (column) =>
            column.notNull(),
        )
        .addColumn('heartbeat_at', 'timestamptz', (column) => column.notNull())
        .addColumn('version', 'integer', (column) =>
            column.notNull().defaultTo(1),
        )
        .addColumn('created_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addColumn('updated_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addCheckConstraint('scheduler_locks_version_check', sql`version >= 1`)
        .execute();

    await db.schema
        .createTable('invoices')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('invoice_number', 'varchar(40)', (column) =>
            column.notNull(),
        )
        .addColumn('subscription_id', 'uuid', (column) =>
            column.notNull().references('subscriptions.id'),
        )
        .addColumn('customer_reference', 'varchar(100)', (column) =>
            column.notNull(),
        )
        .addColumn('billing_period_start', 'date', (column) => column.notNull())
        .addColumn('billing_period_end', 'date', (column) => column.notNull())
        .addColumn('issue_date', 'date', (column) => column.notNull())
        .addColumn('status', 'varchar(20)', (column) => column.notNull())
        .addColumn('currency', 'char(3)', (column) => column.notNull())
        .addColumn('subtotal', sql`numeric(19, 4)`, (column) =>
            column.notNull(),
        )
        .addColumn('tax_total', sql`numeric(19, 4)`, (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('discount_total', sql`numeric(19, 4)`, (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('total', sql`numeric(19, 4)`, (column) => column.notNull())
        .addColumn('idempotency_key', 'varchar(180)', (column) =>
            column.notNull(),
        )
        .addColumn('generated_by_run_id', 'uuid', (column) =>
            column.references('scheduler_runs.id'),
        )
        .addColumn('created_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addCheckConstraint('invoices_status_check', sql`status = 'issued'`)
        .addCheckConstraint(
            'invoices_currency_check',
            sql`currency ~ '^[A-Z]{3}$'`,
        )
        .addCheckConstraint(
            'invoices_period_check',
            sql`billing_period_end > billing_period_start`,
        )
        .addCheckConstraint(
            'invoices_totals_check',
            sql`subtotal >= 0 and tax_total >= 0 and discount_total >= 0 and total >= 0`,
        )
        .addUniqueConstraint('invoices_invoice_number_uniq', ['invoice_number'])
        .addUniqueConstraint('invoices_period_uniq', [
            'subscription_id',
            'billing_period_start',
            'billing_period_end',
        ])
        .addUniqueConstraint('invoices_idempotency_uniq', ['idempotency_key'])
        .execute();

    await db.schema
        .createTable('invoice_items')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('invoice_id', 'uuid', (column) =>
            column.notNull().references('invoices.id'),
        )
        .addColumn('description', 'varchar(255)', (column) => column.notNull())
        .addColumn('quantity', sql`numeric(12, 4)`, (column) =>
            column.notNull().defaultTo(1),
        )
        .addColumn('unit_price', sql`numeric(19, 4)`, (column) =>
            column.notNull(),
        )
        .addColumn('line_total', sql`numeric(19, 4)`, (column) =>
            column.notNull(),
        )
        .addColumn('created_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addCheckConstraint('invoice_items_quantity_check', sql`quantity > 0`)
        .addCheckConstraint(
            'invoice_items_amounts_check',
            sql`unit_price >= 0 and line_total >= 0`,
        )
        .execute();

    await db.schema
        .createTable('scheduler_run_items')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('run_id', 'uuid', (column) =>
            column.notNull().references('scheduler_runs.id'),
        )
        .addColumn('subscription_id', 'uuid', (column) =>
            column.notNull().references('subscriptions.id'),
        )
        .addColumn('result', 'varchar(30)', (column) => column.notNull())
        .addColumn('before_billing_date', 'date', (column) => column.notNull())
        .addColumn('after_billing_date', 'date')
        .addColumn('invoices_created', 'integer', (column) =>
            column.notNull().defaultTo(0),
        )
        .addColumn('error_type', 'varchar(30)')
        .addColumn('error_code', 'varchar(80)')
        .addColumn('error_message', 'varchar(500)')
        .addColumn('started_at', 'timestamptz', (column) => column.notNull())
        .addColumn('completed_at', 'timestamptz', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) =>
            column.notNull().defaultTo(sql`now()`),
        )
        .addCheckConstraint(
            'scheduler_run_items_result_check',
            sql`result in ('success', 'failed', 'duplicate_confirmed', 'skipped')`,
        )
        .addCheckConstraint(
            'scheduler_run_items_error_type_check',
            sql`error_type is null or error_type in ('transient', 'permanent')`,
        )
        .addCheckConstraint(
            'scheduler_run_items_invoice_count_check',
            sql`invoices_created >= 0`,
        )
        .execute();

    await db.schema
        .createIndex('subscriptions_due_idx')
        .on('subscriptions')
        .columns([
            'status',
            'billing_state',
            'next_billing_date',
            'billing_retry_at',
            'id',
        ])
        .execute();

    await db.schema
        .createIndex('subscriptions_claim_expiry_idx')
        .on('subscriptions')
        .column('processing_expires_at')
        .where(sql.ref('processing_run_id'), 'is not', null)
        .execute();

    await db.schema
        .createIndex('invoices_customer_date_idx')
        .on('invoices')
        .columns(['customer_reference', 'issue_date desc'])
        .execute();

    await db.schema
        .createIndex('invoice_items_invoice_id_idx')
        .on('invoice_items')
        .column('invoice_id')
        .execute();

    await db.schema
        .createIndex('run_items_run_result_idx')
        .on('scheduler_run_items')
        .columns(['run_id', 'result'])
        .execute();

    await db.schema
        .createIndex('runs_job_time_idx')
        .on('scheduler_runs')
        .columns(['job_name', 'triggered_at desc'])
        .execute();

    await sql`
        create function set_updated_at()
        returns trigger
        language plpgsql
        as $$
        begin
            new.updated_at = now();
            return new;
        end;
        $$
    `.execute(db);

    await sql`
        create trigger scheduler_runs_set_updated_at
        before update on scheduler_runs
        for each row
        execute function set_updated_at()
    `.execute(db);

    await sql`
        create trigger subscriptions_set_updated_at
        before update on subscriptions
        for each row
        execute function set_updated_at()
    `.execute(db);

    await sql`
        create trigger scheduler_locks_set_updated_at
        before update on scheduler_locks
        for each row
        execute function set_updated_at()
    `.execute(db);
}

/** Drops the Phase 2 core database schema in reverse dependency order. */
export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('scheduler_run_items').execute();
    await db.schema.dropTable('invoice_items').execute();
    await db.schema.dropTable('invoices').execute();
    await db.schema.dropTable('scheduler_locks').execute();
    await db.schema.dropTable('subscriptions').execute();
    await db.schema.dropTable('scheduler_runs').execute();
    await sql`drop function set_updated_at()`.execute(db);
}
