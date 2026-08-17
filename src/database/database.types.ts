import type { ColumnType, Generated } from 'kysely';

type DateValue = ColumnType<string, string, string>;
type NullableDateValue = ColumnType<
    string | null,
    string | null | undefined,
    string | null
>;
type NullableStringValue = ColumnType<
    string | null,
    string | null | undefined,
    string | null
>;
type TimestampValue = ColumnType<Date, Date | string, Date | string>;
type NullableTimestampValue = ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null
>;
type NumericValue = ColumnType<string, string | number, string | number>;
type GeneratedNumericValue = ColumnType<
    string,
    string | number | undefined,
    string | number
>;
type GeneratedTimestampValue = ColumnType<
    Date,
    Date | string | undefined,
    Date | string
>;

export interface SchedulerRunsTable {
    id: string;
    job_name: string;
    trigger_type: 'scheduled' | 'manual';
    triggered_at: TimestampValue;
    cutoff_date: DateValue;
    status:
        | 'running'
        | 'completed'
        | 'completed_with_errors'
        | 'failed'
        | 'skipped_lock_unavailable'
        | 'abandoned'
        | 'interrupted';
    instance_id: string;
    lease_owner_token: NullableStringValue;
    started_at: NullableTimestampValue;
    completed_at: NullableTimestampValue;
    last_heartbeat_at: NullableTimestampValue;
    eligible_count: Generated<number>;
    claimed_count: Generated<number>;
    succeeded_count: Generated<number>;
    failed_count: Generated<number>;
    skipped_count: Generated<number>;
    invoices_created_count: Generated<number>;
    error_code: NullableStringValue;
    error_message: NullableStringValue;
    created_at: GeneratedTimestampValue;
    updated_at: GeneratedTimestampValue;
}

export interface SubscriptionsTable {
    id: string;
    customer_reference: string;
    description: string;
    status: 'active' | 'paused' | 'canceled';
    billing_state: 'ready' | 'retry_wait' | 'blocked';
    currency: string;
    amount: NumericValue;
    start_date: DateValue;
    next_billing_date: DateValue;
    billing_anchor_day: number;
    anchor_is_month_end: boolean;
    billing_failure_count: Generated<number>;
    billing_retry_at: NullableTimestampValue;
    last_billing_error_code: NullableStringValue;
    last_billing_error_message: NullableStringValue;
    processing_run_id: NullableStringValue;
    processing_owner: NullableStringValue;
    processing_started_at: NullableTimestampValue;
    processing_expires_at: NullableTimestampValue;
    version: Generated<number>;
    created_at: GeneratedTimestampValue;
    updated_at: GeneratedTimestampValue;
}

export interface SchedulerLocksTable {
    lock_name: string;
    owner_token: string;
    acquired_at: TimestampValue;
    lease_expires_at: TimestampValue;
    heartbeat_at: TimestampValue;
    version: Generated<number>;
    created_at: GeneratedTimestampValue;
    updated_at: GeneratedTimestampValue;
}

export interface InvoicesTable {
    id: string;
    invoice_number: string;
    subscription_id: string;
    customer_reference: string;
    billing_period_start: DateValue;
    billing_period_end: DateValue;
    issue_date: DateValue;
    status: 'issued';
    currency: string;
    subtotal: NumericValue;
    tax_total: GeneratedNumericValue;
    discount_total: GeneratedNumericValue;
    total: NumericValue;
    idempotency_key: string;
    generated_by_run_id: NullableStringValue;
    created_at: GeneratedTimestampValue;
}

export interface InvoiceItemsTable {
    id: string;
    invoice_id: string;
    description: string;
    quantity: GeneratedNumericValue;
    unit_price: NumericValue;
    line_total: NumericValue;
    created_at: GeneratedTimestampValue;
}

export interface SchedulerRunItemsTable {
    id: string;
    run_id: string;
    subscription_id: string;
    result: 'success' | 'failed' | 'duplicate_confirmed' | 'skipped';
    before_billing_date: DateValue;
    after_billing_date: NullableDateValue;
    invoices_created: Generated<number>;
    error_type: ColumnType<
        'transient' | 'permanent' | null,
        'transient' | 'permanent' | null | undefined,
        'transient' | 'permanent' | null
    >;
    error_code: NullableStringValue;
    error_message: NullableStringValue;
    started_at: TimestampValue;
    completed_at: TimestampValue;
    created_at: GeneratedTimestampValue;
}

export interface DatabaseSchema {
    scheduler_runs: SchedulerRunsTable;
    subscriptions: SubscriptionsTable;
    scheduler_locks: SchedulerLocksTable;
    invoices: InvoicesTable;
    invoice_items: InvoiceItemsTable;
    scheduler_run_items: SchedulerRunItemsTable;
}
