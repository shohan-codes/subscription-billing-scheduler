export const $database = {
    token: {
        CLIENT: Symbol('DATABASE'),
    },
    subscription: {
        status: {
            ACTIVE: 'active',
            PAUSED: 'paused',
            CANCELED: 'canceled',
        },
        billingState: {
            READY: 'ready',
            RETRY_WAIT: 'retry_wait',
            BLOCKED: 'blocked',
        },
        processingOwner: {
            MAX_LENGTH: 120,
        },
    },
    invoice: {
        status: {
            ISSUED: 'issued',
        },
    },
    schedulerRun: {
        triggerType: {
            SCHEDULED: 'scheduled',
            MANUAL: 'manual',
        },
        status: {
            RUNNING: 'running',
            COMPLETED: 'completed',
            COMPLETED_WITH_ERRORS: 'completed_with_errors',
            FAILED: 'failed',
            SKIPPED_LOCK_UNAVAILABLE: 'skipped_lock_unavailable',
            ABANDONED: 'abandoned',
            INTERRUPTED: 'interrupted',
        },
    },
    schedulerRunItem: {
        result: {
            SUCCESS: 'success',
            FAILED: 'failed',
            DUPLICATE_CONFIRMED: 'duplicate_confirmed',
            SKIPPED: 'skipped',
        },
        errorType: {
            TRANSIENT: 'transient',
            PERMANENT: 'permanent',
        },
    },
    postgres: {
        transientErrorCode: {
            SERIALIZATION_FAILURE: '40001',
            DEADLOCK_DETECTED: '40P01',
            LOCK_NOT_AVAILABLE: '55P03',
            CONNECTION_EXCEPTION: '08000',
            SQL_CLIENT_UNABLE_TO_ESTABLISH_CONNECTION: '08001',
            CONNECTION_DOES_NOT_EXIST: '08003',
            CONNECTION_FAILURE: '08006',
            TRANSACTION_RESOLUTION_UNKNOWN: '08007',
            PROTOCOL_VIOLATION: '08P01',
            ADMIN_SHUTDOWN: '57P01',
            CRASH_SHUTDOWN: '57P02',
            CANNOT_CONNECT_NOW: '57P03',
        },
    },
} as const;

export type DatabaseSubscriptionStatus =
    (typeof $database.subscription.status)[keyof typeof $database.subscription.status];
export type DatabaseSubscriptionBillingState =
    (typeof $database.subscription.billingState)[keyof typeof $database.subscription.billingState];
export type DatabaseInvoiceStatus =
    (typeof $database.invoice.status)[keyof typeof $database.invoice.status];
export type DatabaseSchedulerTriggerType =
    (typeof $database.schedulerRun.triggerType)[keyof typeof $database.schedulerRun.triggerType];
export type DatabaseSchedulerRunStatus =
    (typeof $database.schedulerRun.status)[keyof typeof $database.schedulerRun.status];
export type DatabaseSchedulerRunItemResult =
    (typeof $database.schedulerRunItem.result)[keyof typeof $database.schedulerRunItem.result];
export type DatabaseSchedulerRunItemErrorType =
    (typeof $database.schedulerRunItem.errorType)[keyof typeof $database.schedulerRunItem.errorType];
