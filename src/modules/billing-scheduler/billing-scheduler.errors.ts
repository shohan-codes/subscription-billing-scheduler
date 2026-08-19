import {
    ConflictException,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';

const BillingSchedulerErrorCode = {
    LeaseUnavailable: 'SCHEDULER_LEASE_UNAVAILABLE',
    RunNotFound: 'SCHEDULER_RUN_NOT_FOUND',
    RunStateConflict: 'SCHEDULER_RUN_STATE_CONFLICT',
    ShuttingDown: 'SCHEDULER_SHUTTING_DOWN',
} as const;

export class SchedulerLeaseUnavailableException extends ConflictException {
    constructor() {
        super({
            code: BillingSchedulerErrorCode.LeaseUnavailable,
            message:
                'Another billing coordinator owns the active scheduler lease',
        });
    }
}

export class SchedulerRunNotFoundException extends NotFoundException {
    constructor() {
        super({
            code: BillingSchedulerErrorCode.RunNotFound,
            message: 'Scheduler run was not found',
        });
    }
}

export class SchedulerRunStateConflictException extends ConflictException {
    constructor() {
        super({
            code: BillingSchedulerErrorCode.RunStateConflict,
            message: 'Scheduler run state changed before it could be updated',
        });
    }
}

export class SchedulerShuttingDownException extends ServiceUnavailableException {
    constructor() {
        super({
            code: BillingSchedulerErrorCode.ShuttingDown,
            message: 'Billing scheduler is shutting down',
        });
    }
}
