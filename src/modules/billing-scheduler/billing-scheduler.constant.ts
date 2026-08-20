import { $database } from '../../database/database.constant';

export const $billingScheduler = {
    job: {
        NAME: 'billing.invoice.scheduler',
    },
    triggerType: $database.schedulerRun.triggerType,
    runStatus: $database.schedulerRun.status,
    runItemResult: $database.schedulerRunItem.result,
    processingStopReason: {
        EXHAUSTED: 'exhausted',
        LEASE_LOST: 'lease_lost',
        SHUTDOWN_INTERRUPTED: 'shutdown_interrupted',
        RUN_LIMIT_REACHED: 'run_limit_reached',
    },
    failureType: {
        TRANSIENT: $database.schedulerRunItem.errorType.TRANSIENT,
        PERMANENT: $database.schedulerRunItem.errorType.PERMANENT,
        LEASE_LOST: 'lease_lost',
        SHUTDOWN_INTERRUPTED: 'shutdown_interrupted',
    },
    errorCode: {
        LEASE_UNAVAILABLE: 'SCHEDULER_LEASE_UNAVAILABLE',
        LEASE_LOST: 'SCHEDULER_LEASE_LOST',
        RUN_NOT_FOUND: 'SCHEDULER_RUN_NOT_FOUND',
        RUN_STATE_CONFLICT: 'SCHEDULER_RUN_STATE_CONFLICT',
        SHUTTING_DOWN: 'SCHEDULER_SHUTTING_DOWN',
        TRIGGER_FAILED: 'SCHEDULER_TRIGGER_FAILED',
        RUN_FAILED: 'SCHEDULER_RUN_FAILED',
        RUN_ABANDONED: 'SCHEDULER_RUN_ABANDONED',
        RUN_LIMIT_REACHED: 'RUN_LIMIT_REACHED',
        SHUTDOWN_INTERRUPTED: 'SHUTDOWN_INTERRUPTED',
        DATABASE_TRANSIENT_FAILURE: 'DATABASE_TRANSIENT_FAILURE',
        BILLING_ITEM_FAILED: 'BILLING_ITEM_FAILED',
    },
    logEvent: {
        CRON_DISABLED: 'billing.cron.disabled',
        CRON_REGISTERED: 'billing.cron.registered',
        CRON_STOPPED: 'billing.cron.stopped',
        TRIGGER_SKIPPED_SHUTDOWN: 'billing.trigger.skipped_shutdown',
        TRIGGER_FAILED: 'billing.trigger.failed',
        SHUTDOWN_TIMEOUT: 'billing.shutdown.timeout',
        ITEM_COMPLETED: 'billing.item.completed',
        ITEM_SKIPPED: 'billing.item.skipped',
        ITEM_FAILED: 'billing.item.failed',
        ITEM_CLAIM_LOST: 'billing.item.claim_lost',
        RUN_SKIPPED: 'billing.run.skipped',
        RUN_ABANDONED_RECOVERED: 'billing.run.abandoned_recovered',
        RUN_STARTED: 'billing.run.started',
        RUN_COMPLETED: 'billing.run.completed',
        RUN_FAILED: 'billing.run.failed',
        RUN_HEARTBEAT_LOST: 'billing.run.heartbeat_lost',
        LEASE_RELEASED: 'billing.lease.released',
        LEASE_HEARTBEAT: 'billing.lease.heartbeat',
        LEASE_HEARTBEAT_FAILED: 'billing.lease.heartbeat_failed',
        LEASE_LOST: 'billing.lease.lost',
    },
    metricLabel: {
        NONE: 'none',
    },
    metric: {
        runTotal: {
            NAME: 'billing_run_total',
            TYPE: 'counter',
            HELP: 'Total billing scheduler runs by trigger type and terminal status.',
        },
        runDurationSeconds: {
            NAME: 'billing_run_duration_seconds',
            TYPE: 'histogram',
            HELP: 'Billing scheduler run duration in seconds by terminal status.',
        },
        subscriptionProcessedTotal: {
            NAME: 'billing_subscription_processed_total',
            TYPE: 'counter',
            HELP: 'Total processed subscriptions by bounded result and error code.',
        },
        itemDurationSeconds: {
            NAME: 'billing_item_duration_seconds',
            TYPE: 'histogram',
            HELP: 'Subscription billing item duration in seconds by result.',
        },
        invoiceCreatedTotal: {
            NAME: 'billing_invoice_created_total',
            TYPE: 'counter',
            HELP: 'Total invoices created by currency.',
        },
        dueSubscriptionCount: {
            NAME: 'billing_due_subscription_count',
            TYPE: 'gauge',
            HELP: 'Current due subscription count by billing state.',
        },
        claimExpiredTotal: {
            NAME: 'billing_claim_expired_total',
            TYPE: 'counter',
            HELP: 'Total expired subscription claims reclaimed by billing runs.',
        },
        leaseContentionTotal: {
            NAME: 'billing_lease_contention_total',
            TYPE: 'counter',
            HELP: 'Total scheduler lease acquisition contentions by stable job name.',
        },
        scheduleLagDays: {
            NAME: 'billing_schedule_lag_days',
            TYPE: 'histogram',
            HELP: 'Whole business days between due date and run cutoff.',
        },
    },
    retry: {
        DELAYS_SECONDS: [60, 300, 900, 3_600, 21_600],
    },
} as const;

export type SchedulerTriggerType =
    (typeof $billingScheduler.triggerType)[keyof typeof $billingScheduler.triggerType];
export type SchedulerRunStatus =
    (typeof $billingScheduler.runStatus)[keyof typeof $billingScheduler.runStatus];
export type SchedulerRunItemResult =
    (typeof $billingScheduler.runItemResult)[keyof typeof $billingScheduler.runItemResult];
export type SchedulerProcessingStopReason =
    (typeof $billingScheduler.processingStopReason)[keyof typeof $billingScheduler.processingStopReason];
export type BillingItemFailureType =
    (typeof $billingScheduler.failureType)[keyof typeof $billingScheduler.failureType];
