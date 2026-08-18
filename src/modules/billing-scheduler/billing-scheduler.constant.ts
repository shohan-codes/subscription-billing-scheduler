export const BILLING_SCHEDULER_JOB_NAME = 'billing.invoice.scheduler';

export const SchedulerTriggerType = {
    Scheduled: 'scheduled',
    Manual: 'manual',
} as const;

export type SchedulerTriggerType =
    (typeof SchedulerTriggerType)[keyof typeof SchedulerTriggerType];

export const SchedulerRunStatus = {
    Running: 'running',
    Completed: 'completed',
    CompletedWithErrors: 'completed_with_errors',
    Failed: 'failed',
    SkippedLockUnavailable: 'skipped_lock_unavailable',
    Abandoned: 'abandoned',
    Interrupted: 'interrupted',
} as const;

export type SchedulerRunStatus =
    (typeof SchedulerRunStatus)[keyof typeof SchedulerRunStatus];

export const SchedulerRunItemResult = {
    Success: 'success',
    Failed: 'failed',
    DuplicateConfirmed: 'duplicate_confirmed',
    Skipped: 'skipped',
} as const;

export type SchedulerRunItemResult =
    (typeof SchedulerRunItemResult)[keyof typeof SchedulerRunItemResult];

export const SchedulerProcessingStopReason = {
    Exhausted: 'exhausted',
    LeaseLost: 'lease_lost',
    ShutdownInterrupted: 'shutdown_interrupted',
    RunLimitReached: 'run_limit_reached',
} as const;

export type SchedulerProcessingStopReason =
    (typeof SchedulerProcessingStopReason)[keyof typeof SchedulerProcessingStopReason];
